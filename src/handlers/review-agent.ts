/**
 * AWS Lambda handler for the MergeWatch review agent.
 *
 * Triggered asynchronously by the WebhookHandler Lambda via Lambda Invoke API.
 *
 * Flow:
 *   1. Parse the incoming ReviewJobPayload
 *   2. Update the review record status to "in_progress" in DynamoDB
 *   3. Fetch PR diff + metadata from GitHub (via installation token)
 *   4. Load repo-specific config from the installations table
 *   5. Run the multi-agent review pipeline via Amazon Bedrock
 *   6. Format the review comment
 *   7. Post or update the GitHub PR comment
 *   8. Update the review record status to "complete" (or "failed")
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  getInstallationOctokit,
  getPRDiff,
  getPRContext,
  findExistingBotComment,
  postReviewComment,
  updateReviewComment,
  addPRReaction,
  getCommentReactions,
  postReplyComment,
  createCheckRun,
} from '../github/client';
import { runReviewPipeline } from '../agents/reviewer';
import { invokeModel } from '../bedrock/client';
import { RESPOND_PROMPT } from '../agents/prompts';
import { formatReviewComment } from '../comment-formatter';
import { mergeConfig, type MergeWatchConfig } from '../config/defaults';
import type { ReviewJobPayload } from '../types/github';
import { minimatch } from 'minimatch';
import type { ReviewItem, ReviewStatus, ReviewFinding, InstallationItem, InstallationSettings } from '../types/db';
import { DEFAULT_INSTALLATION_SETTINGS as DEFAULTS } from '../types/db';

// -- AWS clients (re-used across warm invocations) ---------------------------

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// -- Environment variables (injected by SAM template) ------------------------
// These match the names defined in infra/template.yaml Globals.Function.Environment.

const INSTALLATIONS_TABLE = process.env.INSTALLATIONS_TABLE ?? 'mergewatch-installations';
const REVIEWS_TABLE = process.env.REVIEWS_TABLE ?? 'mergewatch-reviews';
const DEFAULT_BEDROCK_MODEL_ID = process.env.DEFAULT_BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-20250514-v1:0';
const DASHBOARD_BASE_URL = process.env.DASHBOARD_BASE_URL ?? 'https://mergewatch.ai';

// -- DynamoDB helpers --------------------------------------------------------

/**
 * Load the installation config for a specific repo from the installations table.
 *
 * The installations table uses:
 *   PK: installationId (String)
 *   SK: repoFullName (String) — e.g. "owner/repo"
 *
 * Returns the full item if found, or null if the repo has no stored config.
 */
async function loadInstallationConfig(
  installationId: number,
  repoFullName: string,
): Promise<InstallationItem | null> {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: INSTALLATIONS_TABLE,
      Key: {
        installationId: String(installationId),
        repoFullName,
      },
    }),
  );

  return (result.Item as InstallationItem) ?? null;
}

/**
 * Create or update a review record in the reviews table.
 *
 * The reviews table uses:
 *   PK: repoFullName (String) — e.g. "owner/repo"
 *   SK: prNumberCommitSha (String) — e.g. "42#abc123"
 */
async function upsertReviewRecord(review: ReviewItem): Promise<void> {
  await dynamodb.send(
    new PutCommand({
      TableName: REVIEWS_TABLE,
      Item: review,
    }),
  );
}

/**
 * Update just the status (and optional fields) of a review record.
 */
async function updateReviewStatus(
  repoFullName: string,
  prNumberCommitSha: string,
  status: ReviewStatus,
  extra: Partial<Omit<ReviewItem, 'repoFullName' | 'prNumberCommitSha' | 'status' | 'createdAt'>> = {},
): Promise<void> {
  const updateParts: string[] = ['#s = :status'];
  const names: Record<string, string> = { '#s': 'status' };
  const values: Record<string, unknown> = { ':status': status };

  // Dynamically add all extra fields to the update expression.
  // Reserved words (model, status) use expression attribute names.
  const reserved = new Set(['model', 'status']);
  let idx = 0;
  for (const [key, val] of Object.entries(extra)) {
    if (val === undefined) continue;
    idx++;
    const alias = `v${idx}`;
    if (reserved.has(key)) {
      const nameAlias = `#n${idx}`;
      names[nameAlias] = key;
      updateParts.push(`${nameAlias} = :${alias}`);
    } else {
      updateParts.push(`${key} = :${alias}`);
    }
    values[`:${alias}`] = val;
  }

  await dynamodb.send(
    new UpdateCommand({
      TableName: REVIEWS_TABLE,
      Key: { repoFullName, prNumberCommitSha },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/**
 * Load installation-level settings from the sentinel row (SK="#SETTINGS").
 * Returns merged defaults if no settings row exists.
 */
async function loadInstallationSettings(
  installationId: number,
): Promise<InstallationSettings> {
  try {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: INSTALLATIONS_TABLE,
        Key: {
          installationId: String(installationId),
          repoFullName: '#SETTINGS',
        },
      }),
    );

    const saved = (result.Item?.settings ?? {}) as Partial<InstallationSettings>;
    return {
      ...DEFAULTS,
      ...saved,
      commentTypes: { ...DEFAULTS.commentTypes, ...(saved.commentTypes ?? {}) },
      summary: { ...DEFAULTS.summary, ...(saved.summary ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

// -- Smart skip logic ---------------------------------------------------------

/**
 * File patterns that indicate a trivial PR not worth reviewing.
 * If ALL changed files match these patterns, the PR is skipped.
 */
const SKIP_PATTERNS = [
  // Lock files and dependency manifests
  '**/*.lock',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/Gemfile.lock',
  '**/Pipfile.lock',
  '**/poetry.lock',
  '**/composer.lock',
  '**/go.sum',
  // Documentation
  '**/*.md',
  '**/*.mdx',
  '**/*.txt',
  '**/*.rst',
  '**/docs/**',
  '**/CHANGELOG*',
  '**/CHANGES*',
  '**/LICENSE*',
  '**/NOTICE*',
  // Generated / build artifacts
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/dist/**',
  '**/build/**',
  '**/node_modules/**',
  '**/.gitignore',
  '**/.gitattributes',
  // Config-only files (version bumps, CI tweaks)
  '**/.github/**',
  '**/.vscode/**',
  '**/.idea/**',
  '**/.editorconfig',
  '**/.eslintignore',
  '**/.prettierignore',
  '**/.prettierrc*',
  '**/.eslintrc*',
  '**/tsconfig.json',
  '**/renovate.json',
  '**/.renovaterc*',
];

/**
 * Check if a PR should be skipped because all changed files are trivial.
 * Returns a skip reason string if skipped, or null if the PR should be reviewed.
 */
function shouldSkipPR(files: string[]): string | null {
  if (files.length === 0) return 'No changed files';

  const nonTrivialFiles = files.filter(
    (file) => !SKIP_PATTERNS.some((pattern) => minimatch(file, pattern)),
  );

  if (nonTrivialFiles.length === 0) {
    // Categorize what the PR contains for the skip reason
    const hasLockFiles = files.some((f) => /\.lock$|lock\.json$|lock\.yaml$|go\.sum$/.test(f));
    const hasDocs = files.some((f) => /\.(md|mdx|txt|rst)$/i.test(f) || /docs\//i.test(f));
    const hasConfig = files.some((f) => /^\.|tsconfig|renovate|eslint|prettier/i.test(f.split('/').pop() ?? ''));

    const reasons: string[] = [];
    if (hasLockFiles) reasons.push('lock files');
    if (hasDocs) reasons.push('docs');
    if (hasConfig) reasons.push('config');
    if (reasons.length === 0) reasons.push('generated/trivial files');

    return `Only ${reasons.join(' + ')} changed`;
  }

  return null;
}

// -- Conversational response handler -----------------------------------------

/**
 * Handle a conversational follow-up to a MergeWatch review.
 *
 * Loads the most recent review for this PR, builds a prompt with the review
 * context + user's comment, and posts a reply.
 */
async function handleRespondMode(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  event: ReviewJobPayload,
): Promise<{ statusCode: number; body: string }> {
  const { installationId, owner, repo, prNumber, userComment, userCommentAuthor } = event;
  const repoFullName = `${owner}/${repo}`;

  try {
    // Find the most recent completed review for this PR
    const prevReviews = await dynamodb.send(
      new QueryCommand({
        TableName: REVIEWS_TABLE,
        KeyConditionExpression: 'repoFullName = :repo AND begins_with(prNumberCommitSha, :pr)',
        ExpressionAttributeValues: {
          ':repo': repoFullName,
          ':pr': `${prNumber}#`,
        },
        ScanIndexForward: false,
        Limit: 5,
      }),
    );

    const latestReview = (prevReviews.Items ?? []).find((item) => item.status === 'complete');

    // Build context from previous review
    const findingsContext = latestReview?.findings
      ? JSON.stringify(latestReview.findings, null, 2)
      : 'No previous findings available.';
    const summaryContext = (latestReview?.summaryText as string) ?? 'No summary available.';

    // Also collect reactions on the bot comment while we're here
    if (latestReview?.commentId) {
      const reactions = await getCommentReactions(
        octokit, owner, repo, latestReview.commentId as number,
      );
      if (Object.keys(reactions).length > 0) {
        await updateReviewStatus(
          repoFullName,
          latestReview.prNumberCommitSha as string,
          latestReview.status as 'complete',
          { reactions },
        ).catch(() => {}); // best-effort
      }
    }

    const modelId = DEFAULT_BEDROCK_MODEL_ID;

    const prompt = `${RESPOND_PROMPT}

--- Previous Review Summary ---
${summaryContext}

--- Previous Review Findings ---
${findingsContext}

--- Developer Comment (from @${userCommentAuthor ?? 'unknown'}) ---
${userComment}

Please respond to the developer's comment:`;

    const response = await invokeModel(modelId, prompt);

    // Post as a reply comment (not updating the review comment)
    await postReplyComment(octokit, owner, repo, prNumber, response);

    console.log(`Posted conversational response for ${repoFullName}#${prNumber}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Response posted' }),
    };
  } catch (error) {
    console.error(`Respond failed for ${repoFullName}#${prNumber}:`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Respond failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

// -- Lambda handler ----------------------------------------------------------

/**
 * Main Lambda handler for the review agent.
 *
 * Receives a {@link ReviewJobPayload} from the WebhookHandler Lambda
 * (via async invocation with InvocationType.Event).
 */
export async function handler(
  event: ReviewJobPayload,
): Promise<{ statusCode: number; body: string }> {
  const { installationId, owner, repo, prNumber, mode, existingCommentId, userComment, userCommentAuthor } = event;
  const repoFullName = `${owner}/${repo}`;

  console.log(`Starting ${mode} for ${repoFullName}#${prNumber}`);

  // Get an authenticated Octokit client for this GitHub App installation.
  const octokit = await getInstallationOctokit(installationId);

  // ── Handle "respond" mode: conversational follow-up ────────────────────
  if (mode === 'respond' && userComment) {
    return handleRespondMode(octokit, event);
  }

  // ── Handle "review" / "summary" modes ──────────────────────────────────

  // Fetch PR context (title, description, branches, files) and head SHA.
  const prContext = await getPRContext(octokit, owner, repo, prNumber);
  const prDetails = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
  const headSha = prDetails.data.head.sha;
  const shortSha = headSha.slice(0, 7);
  const prNumberCommitSha = `${prNumber}#${shortSha}`;

  // ── Smart skip: auto-skip trivial PRs (docs-only, lock files, etc.) ────
  const skipReason = shouldSkipPR(prContext.files);
  if (skipReason) {
    console.log(`Skipping ${repoFullName}#${prNumber}: ${skipReason}`);

    // Record as skipped in DynamoDB
    const skippedRecord: ReviewItem = {
      repoFullName,
      prNumberCommitSha,
      status: 'skipped',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      prTitle: prContext.title,
      prAuthor: prDetails.data.user?.login,
      prAuthorAvatar: prDetails.data.user?.avatar_url,
      headBranch: prDetails.data.head.ref,
      baseBranch: prDetails.data.base.ref,
      installationId: String(installationId),
      skipReason,
    };
    await upsertReviewRecord(skippedRecord);

    // Post a neutral check run so the PR merge box shows "Skipped"
    await createCheckRun(octokit, owner, repo, headSha, {
      status: 'completed',
      conclusion: 'neutral',
      title: 'Review skipped',
      summary: skipReason,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Skipped', reason: skipReason }),
    };
  }

  // Create the initial review record in DynamoDB with status "in_progress".
  const reviewStartedAt = new Date().toISOString();
  const reviewRecord: ReviewItem = {
    repoFullName,
    prNumberCommitSha,
    status: 'in_progress',
    createdAt: reviewStartedAt,
    prTitle: prContext.title,
    prAuthor: prDetails.data.user?.login,
    prAuthorAvatar: prDetails.data.user?.avatar_url,
    headBranch: prDetails.data.head.ref,
    baseBranch: prDetails.data.base.ref,
    installationId: String(installationId),
  };
  await upsertReviewRecord(reviewRecord);

  // React with 👀 to signal review has started
  await addPRReaction(octokit, owner, repo, prNumber, 'eyes');

  // Post an in-progress check run so the PR merge box shows "Review running"
  await createCheckRun(octokit, owner, repo, headSha, {
    status: 'in_progress',
    title: 'Review in progress',
    summary: `MergeWatch is reviewing PR #${prNumber}...`,
  });

  try {
    // Fetch PR diff
    const diff = await getPRDiff(octokit, owner, repo, prNumber);

    // Load repo-specific config from the installations table.
    const installation = await loadInstallationConfig(installationId, repoFullName);

    // Load installation-level settings (from the Settings page).
    const instSettings = await loadInstallationSettings(installationId);

    // Map installation settings to MergeWatchConfig overrides.
    const severityMap = { Low: 'info', Med: 'warning', High: 'critical' } as const;
    const settingsOverrides: Partial<MergeWatchConfig> = {
      minSeverity: severityMap[instSettings.severityThreshold],
      maxFindings: instSettings.maxComments,
      agents: {
        security: instSettings.commentTypes.logic,
        bugs: instSettings.commentTypes.syntax,
        style: instSettings.commentTypes.style,
        summary: instSettings.summary.prSummary,
      },
      customStyleRules: instSettings.customInstructions
        ? [instSettings.customInstructions]
        : [],
    };

    // Merge: defaults <- installation settings.
    // Note: .mergewatch.yml (RepoConfig) controls repo-level behavior like
    // enabled, language, ignore patterns — it does NOT override MergeWatchConfig
    // fields like agents/severity. Those are controlled by installation settings.
    const runtimeConfig = mergeConfig(settingsOverrides);

    // Determine which Bedrock model to use. Priority:
    //   1. Per-repo override (installation.modelId)
    //   2. Global default from SAM template env var
    const modelId = installation?.modelId ?? DEFAULT_BEDROCK_MODEL_ID;
    const lightModelId = runtimeConfig.lightModel;

    // Derive a human-friendly model name for the comment header.
    const { SUPPORTED_MODELS } = await import('../bedrock/client');
    const modelName = Object.entries(SUPPORTED_MODELS)
      .find(([, id]) => id === modelId)?.[0] ?? modelId;

    // Run the multi-agent review pipeline via Amazon Bedrock.
    const result = await runReviewPipeline({
      diff,
      context: {
        owner,
        repo,
        prNumber,
        prTitle: prContext.title,
        prBody: prContext.description ?? undefined,
      },
      modelId,
      lightModelId,
      customStyleRules: runtimeConfig.customStyleRules,
      maxFindings: runtimeConfig.maxFindings,
      enabledAgents: mode === 'summary'
        ? { security: false, bugs: false, style: false, summary: true, diagram: false }
        : { ...runtimeConfig.agents, diagram: instSettings.summary.diagram },
    });

    // Build the review detail URL for the dashboard
    const reviewDetailUrl = `${DASHBOARD_BASE_URL}/dashboard/reviews/${encodeURIComponent(`${repoFullName}:${prNumberCommitSha}`)}`;

    // Format the GitHub PR comment from the review results.
    const commentBody = formatReviewComment({
      summary: result.summary,
      findings: result.findings,
      commentFooter: instSettings.commentHeader || undefined,
      showSummary: instSettings.summary.prSummary,
      showIssuesTable: instSettings.summary.issuesTable,
      showConfidence: instSettings.summary.confidenceScore,
      diagram: result.diagram || undefined,
      diagramCaption: result.diagramCaption || undefined,
      showDiagram: instSettings.summary.diagram,
      reviewDetailUrl,
      mergeScore: result.mergeScore,
      mergeScoreReason: result.mergeScoreReason || undefined,
    });

    // Post or update the review comment on the PR.
    // Try multiple strategies to find the existing comment:
    //   1. existingCommentId from webhook handler (passed via payload)
    //   2. Previous review record in DynamoDB (for the same PR, different commit)
    //   3. Scan GitHub comments for the bot marker (fallback)
    let commentId: number | undefined;
    let targetCommentId = existingCommentId;

    if (!targetCommentId) {
      // Look up previous reviews for this PR to find a stored commentId.
      try {
        const prevReviews = await dynamodb.send(
          new QueryCommand({
            TableName: REVIEWS_TABLE,
            KeyConditionExpression: 'repoFullName = :repo AND begins_with(prNumberCommitSha, :pr)',
            ExpressionAttributeValues: {
              ':repo': repoFullName,
              ':pr': `${prNumber}#`,
            },
            ScanIndexForward: false,
            Limit: 5,
          }),
        );
        for (const item of prevReviews.Items ?? []) {
          if (item.commentId && item.prNumberCommitSha !== prNumberCommitSha) {
            targetCommentId = item.commentId as number;
            break;
          }
        }
      } catch (err) {
        console.warn('Failed to look up previous review comment ID from DynamoDB:', err);
      }
    }

    if (!targetCommentId) {
      // Final fallback: scan GitHub comments for the bot marker.
      targetCommentId = (await findExistingBotComment(octokit, owner, repo, prNumber)) ?? undefined;
    }

    if (targetCommentId) {
      await updateReviewComment(octokit, owner, repo, targetCommentId, commentBody);
      commentId = targetCommentId;
    } else {
      commentId = await postReviewComment(octokit, owner, repo, prNumber, commentBody);
    }

    // React with 👍 to signal review is complete
    await addPRReaction(octokit, owner, repo, prNumber, '+1');

    // Collect reactions on the bot comment (from previous reviews)
    let reactions: Record<string, number> | undefined;
    if (commentId) {
      const reactionCounts = await getCommentReactions(octokit, owner, repo, commentId);
      if (Object.keys(reactionCounts).length > 0) {
        reactions = reactionCounts;
      }
    }

    // Compute top severity across findings
    const severityRank = { critical: 0, warning: 1, info: 2 } as const;
    const topSeverity = result.findings.length > 0
      ? result.findings.reduce((top, f) =>
          severityRank[f.severity] < severityRank[top] ? f.severity : top,
        result.findings[0].severity)
      : undefined;

    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt).getTime() - new Date(reviewStartedAt).getTime();

    // Update the review record to "complete" with rich data.
    await updateReviewStatus(repoFullName, prNumberCommitSha, 'complete', {
      commentId,
      completedAt,
      model: modelName,
      settingsUsed: {
        severityThreshold: instSettings.severityThreshold,
        commentTypes: instSettings.commentTypes,
        maxComments: instSettings.maxComments,
        summaryEnabled: instSettings.summary.prSummary,
        customInstructions: !!instSettings.customInstructions,
      },
      findingCount: result.findings.length,
      topSeverity,
      durationMs,
      summaryText: result.summary || undefined,
      diagramText: result.diagram || undefined,
      findings: result.findings as ReviewFinding[],
      reactions,
      mergeScore: result.mergeScore,
      mergeScoreReason: result.mergeScoreReason || undefined,
    });

    // Post completed check run with pass/fail based on critical findings
    const hasCritical = result.findings.some((f) => f.severity === 'critical');
    const checkConclusion = hasCritical ? 'failure' as const : 'success' as const;
    const findingSummaryParts: string[] = [];
    const criticalCount = result.findings.filter((f) => f.severity === 'critical').length;
    const warningCount = result.findings.filter((f) => f.severity === 'warning').length;
    const infoCount = result.findings.filter((f) => f.severity === 'info').length;
    if (criticalCount) findingSummaryParts.push(`${criticalCount} critical`);
    if (warningCount) findingSummaryParts.push(`${warningCount} warning`);
    if (infoCount) findingSummaryParts.push(`${infoCount} info`);

    await createCheckRun(octokit, owner, repo, headSha, {
      status: 'completed',
      conclusion: checkConclusion,
      title: hasCritical
        ? `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} found`
        : result.findings.length > 0
          ? `${result.findings.length} finding${result.findings.length > 1 ? 's' : ''} (no critical)`
          : 'No issues found',
      summary: findingSummaryParts.length > 0
        ? `Found: ${findingSummaryParts.join(', ')}`
        : 'No issues detected in this PR.',
      detailsUrl: reviewDetailUrl,
    });

    console.log(
      `Review complete for ${repoFullName}#${prNumber}: ${result.findings.length} findings`,
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Review complete',
        findingsCount: result.findings.length,
      }),
    };
  } catch (error) {
    console.error(`Review failed for ${repoFullName}#${prNumber}:`, error);

    // Mark the review record as failed.
    await updateReviewStatus(repoFullName, prNumberCommitSha, 'failed', {
      completedAt: new Date().toISOString(),
    }).catch((updateErr) => {
      // Don't let a DynamoDB error mask the original error.
      console.error('Failed to update review status to failed:', updateErr);
    });

    // Post a failed check run so the PR shows the error
    await createCheckRun(octokit, owner, repo, headSha, {
      status: 'completed',
      conclusion: 'failure',
      title: 'Review failed',
      summary: `MergeWatch encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Review failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
