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
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  getInstallationOctokit,
  getPRDiff,
  getPRContext,
  findExistingBotComment,
  postReviewComment,
  updateReviewComment,
  addPRReaction,
} from '../github/client';
import { runReviewPipeline } from '../agents/reviewer';
import { formatReviewComment } from '../comment-formatter';
import { mergeConfig, type MergeWatchConfig } from '../config/defaults';
import type { ReviewJobPayload } from '../types/github';
import type { ReviewItem, ReviewStatus, InstallationItem, InstallationSettings } from '../types/db';
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
  extra: { commentId?: number; completedAt?: string; model?: string; settingsUsed?: ReviewItem['settingsUsed'] } = {},
): Promise<void> {
  const updateParts: string[] = ['#s = :status'];
  const names: Record<string, string> = { '#s': 'status' };
  const values: Record<string, unknown> = { ':status': status };

  if (extra.commentId !== undefined) {
    updateParts.push('commentId = :cid');
    values[':cid'] = extra.commentId;
  }
  if (extra.completedAt !== undefined) {
    updateParts.push('completedAt = :cat');
    values[':cat'] = extra.completedAt;
  }
  if (extra.model !== undefined) {
    updateParts.push('#m = :model');
    names['#m'] = 'model';
    values[':model'] = extra.model;
  }
  if (extra.settingsUsed !== undefined) {
    updateParts.push('settingsUsed = :su');
    values[':su'] = extra.settingsUsed;
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
  const { installationId, owner, repo, prNumber, mode, existingCommentId } = event;
  const repoFullName = `${owner}/${repo}`;

  console.log(`Starting ${mode} for ${repoFullName}#${prNumber}`);

  // Get an authenticated Octokit client for this GitHub App installation.
  const octokit = await getInstallationOctokit(installationId);

  // Fetch PR context to get the head commit SHA (needed for the review record key).
  const prContext = await getPRContext(octokit, owner, repo, prNumber);
  const commitSha = prContext.headBranch; // We'll get the actual SHA from the diff

  // Fetch the PR details to get the head SHA
  const prDetails = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
  const headSha = prDetails.data.head.sha;
  const shortSha = headSha.slice(0, 7);
  const prNumberCommitSha = `${prNumber}#${shortSha}`;

  // Create the initial review record in DynamoDB with status "in_progress".
  const reviewRecord: ReviewItem = {
    repoFullName,
    prNumberCommitSha,
    status: 'in_progress',
    createdAt: new Date().toISOString(),
    prTitle: prContext.title,
  };
  await upsertReviewRecord(reviewRecord);

  // React with 👀 to signal review has started
  await addPRReaction(octokit, owner, repo, prNumber, 'eyes');

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
        ? { security: false, bugs: false, style: false, summary: true }
        : runtimeConfig.agents,
    });

    // Build the review detail URL for the dashboard
    const reviewDetailUrl = `${DASHBOARD_BASE_URL}/dashboard/reviews/${encodeURIComponent(`${repoFullName}:${prNumberCommitSha}`)}`;

    // Format the GitHub PR comment from the review results.
    const commentBody = formatReviewComment({
      modelName,
      commitSha: headSha,
      summary: result.summary,
      findings: result.findings,
      commentHeader: instSettings.commentHeader || undefined,
      showSummary: instSettings.summary.prSummary,
      showIssuesTable: instSettings.summary.issuesTable,
      reviewDetailUrl,
    });

    // Post or update the review comment on the PR.
    let commentId: number | undefined;
    if (existingCommentId) {
      // Update the existing MergeWatch comment in-place.
      await updateReviewComment(octokit, owner, repo, existingCommentId, commentBody);
      commentId = existingCommentId;
    } else {
      // Check if there's already a bot comment we missed (race condition guard).
      const foundCommentId = await findExistingBotComment(octokit, owner, repo, prNumber);
      if (foundCommentId) {
        await updateReviewComment(octokit, owner, repo, foundCommentId, commentBody);
        commentId = foundCommentId;
      } else {
        commentId = await postReviewComment(octokit, owner, repo, prNumber, commentBody);
      }
    }

    // React with 👍 to signal review is complete
    await addPRReaction(octokit, owner, repo, prNumber, '+1');

    // Update the review record to "complete" with the comment ID and settings snapshot.
    await updateReviewStatus(repoFullName, prNumberCommitSha, 'complete', {
      commentId,
      completedAt: new Date().toISOString(),
      model: modelName,
      settingsUsed: {
        severityThreshold: instSettings.severityThreshold,
        commentTypes: instSettings.commentTypes,
        maxComments: instSettings.maxComments,
        summaryEnabled: instSettings.summary.prSummary,
        customInstructions: !!instSettings.customInstructions,
      },
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

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Review failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
