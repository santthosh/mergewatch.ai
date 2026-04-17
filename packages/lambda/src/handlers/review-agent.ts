/**
 * AWS Lambda handler for the MergeWatch review agent.
 *
 * Triggered asynchronously by the WebhookHandler Lambda via Lambda Invoke API.
 *
 * This handler wires together:
 *   - BedrockLLMProvider (ILLMProvider)
 *   - DynamoInstallationStore + DynamoReviewStore (IInstallationStore + IReviewStore)
 *   - SSMGitHubAuthProvider (IGitHubAuthProvider)
 *   - Core review pipeline (runReviewPipeline)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  getPRDiff,
  getPRContext,
  findExistingBotComment,
  postReviewComment,
  updateReviewComment,
  addPRReaction,
  getCommentReactions,
  postReplyComment,
  createCheckRun,
  runReviewPipeline,
  formatReviewComment,
  mergeConfig,
  shouldSkipPR,
  shouldSkipByRules,
  filterDiff,
  RESPOND_PROMPT,
  BOT_COMMENT_MARKER,
  submitPRReview,
  dismissStaleReviews,
  mergeScoreToReviewEvent,
  buildIssueCommentUrl,
  formatPRReviewVerdict,
  buildInlineComments,
  extractInlineCommentTitle,
  fetchRepoConfig,
} from '@mergewatch/core';
import type {
  ReviewJobPayload,
  ReviewItem,
  ReviewFinding,
  MergeWatchConfig,
  FileFetchOptions,
  ReviewDelta,
} from '@mergewatch/core';
import { buildWorkDoneSection, computeReviewDelta } from '@mergewatch/core';
import { DynamoInstallationStore } from '@mergewatch/storage-dynamo';
import { DynamoReviewStore } from '@mergewatch/storage-dynamo';
import { BedrockLLMProvider, SUPPORTED_MODELS } from '@mergewatch/llm-bedrock';
import { isSaas, billingCheck, recordReview, postBlockedCheckRun, ensureBillingIssue, updateBillingFields, getStripe } from '@mergewatch/billing';
import { SSMGitHubAuthProvider } from '../github-auth-ssm.js';

// -- Singletons (re-used across warm invocations) ----------------------------

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const INSTALLATIONS_TABLE = process.env.INSTALLATIONS_TABLE ?? 'mergewatch-installations';
const REVIEWS_TABLE = process.env.REVIEWS_TABLE ?? 'mergewatch-reviews';
const DEFAULT_BEDROCK_MODEL_ID = process.env.DEFAULT_BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-20250514-v1:0';
const DASHBOARD_BASE_URL = process.env.DASHBOARD_BASE_URL ?? 'https://mergewatch.ai';

const installationStore = new DynamoInstallationStore(dynamodb, INSTALLATIONS_TABLE);
const reviewStore = new DynamoReviewStore(dynamodb, REVIEWS_TABLE);
const llm = new BedrockLLMProvider();
const authProvider = new SSMGitHubAuthProvider();

// -- Conversational response handler -----------------------------------------

async function handleRespondMode(
  octokit: Awaited<ReturnType<typeof authProvider.getInstallationOctokit>>,
  event: ReviewJobPayload,
): Promise<{ statusCode: number; body: string }> {
  const { owner, repo, prNumber, userComment, userCommentAuthor } = event;
  const repoFullName = `${owner}/${repo}`;

  try {
    const prevReviews = await reviewStore.queryByPR(repoFullName, `${prNumber}#`, 5);

    const latestReview = prevReviews.find((item) => item.status === 'complete');

    const findingsContext = latestReview?.findings
      ? JSON.stringify(latestReview.findings, null, 2)
      : 'No previous findings available.';
    const summaryContext = (latestReview?.summaryText as string) ?? 'No summary available.';

    if (latestReview?.commentId) {
      const reactions = await getCommentReactions(
        octokit, owner, repo, latestReview.commentId as number,
      );
      if (Object.keys(reactions).length > 0) {
        await reviewStore.updateStatus(
          repoFullName,
          latestReview.prNumberCommitSha as string,
          latestReview.status as 'complete',
          { reactions },
        ).catch(() => {});
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

    const rawResponse = await llm.invoke(modelId, prompt);
    const response = typeof rawResponse === 'string' ? rawResponse : rawResponse.text;

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

export async function handler(
  event: ReviewJobPayload,
): Promise<{ statusCode: number; body: string }> {
  const { installationId, owner, repo, prNumber, mode, existingCommentId, userComment, userCommentAuthor } = event;
  const repoFullName = `${owner}/${repo}`;

  console.log(`Starting ${mode} for ${repoFullName}#${prNumber}`);

  const octokit = await authProvider.getInstallationOctokit(installationId);

  // ── Handle "respond" mode: conversational follow-up ────────────────────
  if (mode === 'respond' && userComment) {
    return handleRespondMode(octokit, event);
  }

  // ── Handle "review" / "summary" modes ──────────────────────────────────

  const prContext = await getPRContext(octokit, owner, repo, prNumber);
  const headSha = prContext.headSha;
  const shortSha = headSha.slice(0, 7);
  const prNumberCommitSha = `${prNumber}#${shortSha}`;

  // ── Smart skip — bypass when user explicitly requested a review via @mergewatch ────
  const skipReason = event.mentionTriggered ? null : shouldSkipPR(prContext.files);
  if (skipReason) {
    console.log(`Skipping ${repoFullName}#${prNumber}: ${skipReason}`);

    const skippedRecord: ReviewItem = {
      repoFullName,
      prNumberCommitSha,
      status: 'skipped',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      prTitle: prContext.title,
      prAuthor: prContext.prAuthor,
      prAuthorAvatar: prContext.prAuthorAvatar,
      headBranch: prContext.headBranch,
      baseBranch: prContext.baseBranch,
      installationId: String(installationId),
      skipReason,
    };
    await reviewStore.upsert(skippedRecord);

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

  // ── Billing gate (SaaS only) ────
  if (isSaas()) {
    const billing = await billingCheck(dynamodb, INSTALLATIONS_TABLE, String(installationId));
    if (billing.status === 'block') {
      console.log(`Billing blocked for installation ${installationId}`);

      await postBlockedCheckRun(octokit, owner, repo, headSha);

      if (billing.firstBlock) {
        await ensureBillingIssue(octokit, owner, repo, String(installationId), dynamodb, INSTALLATIONS_TABLE);
        await updateBillingFields(dynamodb, INSTALLATIONS_TABLE, String(installationId), {
          blockedAt: new Date().toISOString(),
        });
      }

      return {
        statusCode: 402,
        body: JSON.stringify({ message: 'Billing: credits required' }),
      };
    }
  }

  // Atomically claim this review — prevents duplicate processing
  const reviewStartedAt = new Date().toISOString();
  const reviewRecord: ReviewItem = {
    repoFullName,
    prNumberCommitSha,
    status: 'in_progress',
    createdAt: reviewStartedAt,
    prTitle: prContext.title,
    prAuthor: prContext.prAuthor,
    prAuthorAvatar: prContext.prAuthorAvatar,
    headBranch: prContext.headBranch,
    baseBranch: prContext.baseBranch,
    installationId: String(installationId),
  };
  const claimed = await reviewStore.claimReview(reviewRecord);
  if (!claimed) {
    console.log(`Review already in progress for ${repoFullName}#${prNumber}@${shortSha}, skipping`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Already in progress', prNumberCommitSha }),
    };
  }

  await addPRReaction(octokit, owner, repo, prNumber, 'eyes');

  await createCheckRun(octokit, owner, repo, headSha, {
    status: 'in_progress',
    title: 'Review in progress',
    summary: `MergeWatch is reviewing PR #${prNumber}...`,
  });

  try {
    const diff = await getPRDiff(octokit, owner, repo, prNumber);

    const installation = await installationStore.get(String(installationId), repoFullName);

    const instSettings = await installationStore.getSettings(String(installationId));

    const severityMap = { Low: 'info', Med: 'warning', High: 'critical' } as const;
    const settingsOverrides: Partial<MergeWatchConfig> = {
      minSeverity: severityMap[instSettings.severityThreshold],
      maxFindings: instSettings.maxComments,
      agents: {
        security: instSettings.commentTypes.logic,
        bugs: instSettings.commentTypes.syntax,
        style: instSettings.commentTypes.style,
        summary: instSettings.summary.prSummary,
        diagram: true,
        errorHandling: true,
        testCoverage: true,
        commentAccuracy: true,
      },
      customStyleRules: instSettings.customInstructions
        ? [instSettings.customInstructions]
        : [],
    };

    const yamlConfig = await fetchRepoConfig(octokit, owner, repo);
    const runtimeConfig = mergeConfig({ ...(yamlConfig ?? {}), ...settingsOverrides });

    // ── Rules-based skip (skipDrafts, maxFiles, ignoreLabels, autoReview, reviewOnMention) ────
    const rulesSkipReason = shouldSkipByRules(runtimeConfig.rules, {
      isDraft: event.isDraft,
      labels: event.prLabels,
      changedFileCount: event.changedFileCount ?? prContext?.files?.length,
      mode,
      mentionTriggered: event.mentionTriggered,
    });
    if (rulesSkipReason) {
      console.log(`Rules skip ${repoFullName}#${prNumber}: ${rulesSkipReason}`);

      await reviewStore.updateStatus(repoFullName, prNumberCommitSha, 'skipped', {
        completedAt: new Date().toISOString(),
        skipReason: rulesSkipReason,
      });

      await createCheckRun(octokit, owner, repo, headSha, {
        status: 'completed',
        conclusion: 'neutral',
        title: 'Review skipped',
        summary: rulesSkipReason,
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Skipped', reason: rulesSkipReason }),
      };
    }

    // ── Filter excluded files from the diff ────
    const allExcludePatterns = [
      ...runtimeConfig.excludePatterns,
      ...runtimeConfig.rules.ignorePatterns,
    ];
    const { filteredDiff, excludedFiles } = filterDiff(diff, allExcludePatterns);
    if (excludedFiles.length > 0) {
      console.log(`Excluded ${excludedFiles.length} file(s) from diff: ${excludedFiles.join(', ')}`);
    }

    const modelId = installation?.modelId ?? DEFAULT_BEDROCK_MODEL_ID;
    const lightModelId = runtimeConfig.lightModel;

    const modelName = Object.entries(SUPPORTED_MODELS)
      .find(([, id]) => id === modelId)?.[0] ?? modelId;

    // Build agentic file fetch options (agents will request files they need)
    const fileFetchOptions: FileFetchOptions | undefined = runtimeConfig.codebaseAwareness
      ? {
          octokit,
          owner,
          repo,
          ref: headSha,
          maxContextKB: runtimeConfig.maxContextKB,
          maxRounds: runtimeConfig.maxFileRequestRounds,
        }
      : undefined;

    // Fetch previous reviews before pipeline (used for diagram consistency + delta computation)
    let prevReviews: ReviewItem[] = [];
    let prevComplete: ReviewItem | undefined;
    try {
      prevReviews = await reviewStore.queryByPR(repoFullName, `${prNumber}#`, 5);
      prevComplete = prevReviews.find(
        (r) => r.status === 'complete' && r.prNumberCommitSha !== prNumberCommitSha && r.findings && r.findings.length > 0,
      );
    } catch (err) {
      console.warn('Failed to fetch previous reviews:', err);
    }

    const previousDiagram = typeof prevComplete?.diagramText === 'string' ? prevComplete.diagramText : undefined;

    const result = await runReviewPipeline({
      diff: filteredDiff,
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
        ? { security: false, bugs: false, style: false, summary: true, diagram: false, errorHandling: false, testCoverage: false, commentAccuracy: false }
        : { ...runtimeConfig.agents, diagram: instSettings.summary.diagram },
      fileFetchOptions,
      customAgents: runtimeConfig.customAgents,
      tone: runtimeConfig.ux.tone,
      customPricing: runtimeConfig.pricing,
      previousDiagram,
      previousFindings: (prevComplete?.findings as any) ?? undefined,
    }, { llm });

    const reviewDetailUrl = `${DASHBOARD_BASE_URL}/dashboard/reviews/${encodeURIComponent(`${repoFullName}:${prNumberCommitSha}`)}`;

    // Build work-done section from PR context stats
    const workDone = buildWorkDoneSection(
      prContext.files,
      prContext.totalAdditions,
      prContext.totalDeletions,
      result.enabledAgentCount,
    );

    // Compute delta from previous review (reusing prevComplete fetched earlier)
    let delta: ReviewDelta | null = null;
    if (prevComplete?.findings) {
      delta = computeReviewDelta(result.findings, prevComplete.findings);
    }

    const durationMs = Date.now() - new Date(reviewStartedAt).getTime();

    // Compute cumulative cost across all reviews on this PR
    const prevCost = prevReviews.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0);
    const cumulativeCostUsd = (result.estimatedCostUsd ?? 0) + prevCost;

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
      ux: runtimeConfig.ux,
      workDone,
      delta,
      suppressedCount: result.suppressedCount,
      enabledAgentCount: result.enabledAgentCount,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: result.estimatedCostUsd,
      cumulativeCostUsd: cumulativeCostUsd > 0 ? cumulativeCostUsd : undefined,
      durationMs,
      model: modelName,
    });

    // ── Step A: Upsert issue comment (full review — primary artifact) ──────
    const reviewEvent = mergeScoreToReviewEvent(result.mergeScore);
    let commentId: number | undefined;

    // Look up existing comment: job payload → DynamoDB → API scan
    let targetCommentId = existingCommentId;

    if (!targetCommentId) {
      for (const item of prevReviews) {
        if (item.commentId && item.prNumberCommitSha !== prNumberCommitSha) {
          targetCommentId = item.commentId as number;
          break;
        }
      }
    }

    if (!targetCommentId) {
      targetCommentId = (await findExistingBotComment(octokit, owner, repo, prNumber)) ?? undefined;
    }

    if (targetCommentId) {
      await updateReviewComment(octokit, owner, repo, targetCommentId, commentBody);
      commentId = targetCommentId;
    } else {
      commentId = await postReviewComment(octokit, owner, repo, prNumber, commentBody);
    }

    if (!commentId) {
      throw new Error('Failed to create or update issue comment');
    }

    // ── Step B: Build inline comments for critical findings ──────────────
    let inlineComments = buildInlineComments(result.findings, prContext.files, result.changedLines);

    // Filter out carried-over findings (same file+line+title as previous review)
    if (prevComplete?.findings && inlineComments.length > 0) {
      const prevKeys = new Set(
        (prevComplete.findings as Array<{ file: string; line: number; title: string }>)
          .map((f) => `${f.file}:${f.line}:${f.title}`),
      );
      inlineComments = inlineComments.filter(
        (c) => !prevKeys.has(`${c.path}:${c.line}:${extractInlineCommentTitle(c.body)}`),
      );
    }

    // ── Step C: Submit PR review with verdict + inline comments ──────────
    const issueCommentUrl = buildIssueCommentUrl(owner, repo, prNumber, commentId);
    const criticalCount = result.findings.filter((f) => f.severity === 'critical').length;
    const warningCount = result.findings.filter((f) => f.severity === 'warning').length;
    const infoCount = result.findings.filter((f) => f.severity === 'info').length;
    const verdictBody = formatPRReviewVerdict(
      result.mergeScore,
      result.mergeScoreReason || undefined,
      { critical: criticalCount, warning: warningCount, info: infoCount },
      issueCommentUrl,
    );

    try {
      await dismissStaleReviews(octokit, owner, repo, prNumber);
      await submitPRReview(octokit, owner, repo, prNumber, verdictBody, reviewEvent, inlineComments);
    } catch (err) {
      console.warn('PR review with inline comments failed, retrying without inline comments:', err);
      try {
        await submitPRReview(octokit, owner, repo, prNumber, verdictBody, reviewEvent);
      } catch (retryErr) {
        console.warn('PR review (verdict only) also failed — issue comment has the full review:', retryErr);
      }
    }

    await addPRReaction(octokit, owner, repo, prNumber, '+1');

    let reactions: Record<string, number> | undefined;
    if (commentId) {
      const reactionCounts = await getCommentReactions(octokit, owner, repo, commentId);
      if (Object.keys(reactionCounts).length > 0) {
        reactions = reactionCounts;
      }
    }

    const severityRank = { critical: 0, warning: 1, info: 2 } as const;
    const topSeverity = result.findings.length > 0
      ? result.findings.reduce((top, f) =>
          severityRank[f.severity] < severityRank[top] ? f.severity : top,
        result.findings[0].severity)
      : undefined;

    const completedAt = new Date().toISOString();

    await reviewStore.updateStatus(repoFullName, prNumberCommitSha, 'complete', {
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
      inputTokens: result.inputTokens || undefined,
      outputTokens: result.outputTokens || undefined,
      estimatedCostUsd: result.estimatedCostUsd ?? undefined,
    });

    // ── Record billing (SaaS only) ────
    // Retry once on failure. If both attempts fail, log as ERROR (not warn)
    // so CloudWatch alarms can catch revenue leaks. We don't throw because
    // the review comment is already posted — crashing would retry the entire
    // review pipeline which is worse than a missed billing record.
    if (isSaas() && result.estimatedCostUsd != null) {
      let stripe;
      try { stripe = await getStripe(); } catch (err) {
        console.warn('[billing] Stripe not configured, skipping balance debit:', err instanceof Error ? err.message : err);
      }
      let billingRecorded = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await recordReview(dynamodb, INSTALLATIONS_TABLE, String(installationId), result.estimatedCostUsd, prNumberCommitSha, stripe);
          billingRecorded = true;
          break;
        } catch (err) {
          if (attempt === 1) {
            console.warn(`[billing] recordReview attempt 1 failed for ${repoFullName}#${prNumber}, retrying:`, err);
          }
        }
      }
      if (!billingRecorded) {
        console.error(`[billing] REVENUE LEAK: recordReview failed after 2 attempts for ${repoFullName}#${prNumber} install=${installationId} cost=$${result.estimatedCostUsd}`);
      }
    }

    const hasCritical = criticalCount > 0;
    const checkConclusion = hasCritical ? 'failure' as const : 'success' as const;
    const findingSummaryParts: string[] = [];
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

    await reviewStore.updateStatus(repoFullName, prNumberCommitSha, 'failed', {
      completedAt: new Date().toISOString(),
    }).catch((updateErr) => {
      console.error('Failed to update review status to failed:', updateErr);
    });

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
