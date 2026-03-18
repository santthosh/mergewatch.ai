import type { ReviewJobPayload, IInstallationStore, IReviewStore, IGitHubAuthProvider, ILLMProvider } from '@mergewatch/core';
import {
  getPRDiff, getPRContext, addPRReaction, postReviewComment, updateReviewComment,
  findExistingBotComment, getCommentReactions, createCheckRun,
  formatReviewComment, runReviewPipeline, shouldSkipPR,
  DEFAULT_CONFIG, mergeConfig,
  BOT_COMMENT_MARKER, submitPRReview, dismissStaleReviews, mergeScoreToReviewEvent,
  fetchRepoConfig,
  fetchFileContents, resolveImportsForFiles,
} from '@mergewatch/core';
import type { WebhookDeps } from './webhook-handler.js';

export async function processReviewJob(
  job: ReviewJobPayload,
  deps: Pick<WebhookDeps, 'installationStore' | 'reviewStore' | 'authProvider' | 'llm' | 'dashboardBaseUrl'>,
): Promise<void> {
  const { installationId, owner, repo, prNumber, mode } = job;
  const instId = String(installationId);
  const repoFullName = `${owner}/${repo}`;
  const octokit = await deps.authProvider.getInstallationOctokit(Number(installationId));

  // Fetch PR context and diff
  const prContext = await getPRContext(octokit, owner, repo, prNumber);
  const diff = await getPRDiff(octokit, owner, repo, prNumber);

  // Generate review key
  const shortSha = prContext.headBranch?.slice(0, 7) || 'unknown';
  const prNumberCommitSha = `${prNumber}#${shortSha}`;

  // Create initial review record
  const now = new Date().toISOString();
  await deps.reviewStore.upsert({
    repoFullName,
    prNumberCommitSha,
    status: 'in_progress',
    createdAt: now,
    prTitle: prContext.title,
    prAuthor: owner,
    installationId: instId,
  });

  // Add eyes reaction
  await addPRReaction(octokit, owner, repo, prNumber, 'eyes').catch(() => {});

  // Smart skip check
  const skipReason = shouldSkipPR(prContext.files || []);
  if (skipReason) {
    await deps.reviewStore.updateStatus(repoFullName, prNumberCommitSha, 'skipped', { skipReason });
    console.log(`Skipped ${repoFullName}#${prNumber}: ${skipReason}`);
    return;
  }

  // Load installation config
  const installation = await deps.installationStore.get(instId, repoFullName);
  const instSettings = await deps.installationStore.getSettings(instId);

  // Merge config: YAML provides base, dashboard settings override, env var model overrides all
  const yamlConfig = await fetchRepoConfig(octokit, owner, repo);
  const modelOverride = process.env.LLM_MODEL;
  const config = mergeConfig({
    ...(yamlConfig ?? {}),
    ...(installation?.config || {}),
    ...(modelOverride ? { model: modelOverride, lightModel: modelOverride } : {}),
  });

  const startTime = Date.now();

  try {
    // Fetch related files for codebase awareness
    let relatedFiles: Record<string, string> | undefined;
    if (config.codebaseAwareness) {
      try {
        const changedFilePaths = prContext.files || [];
        const ref = prContext.headBranch || 'HEAD';
        const changedFileContents = await fetchFileContents(
          octokit, owner, repo, ref, changedFilePaths, config.maxContextKB,
        );

        const importPaths = resolveImportsForFiles(changedFileContents, config.maxDependencyDepth);

        if (importPaths.length > 0) {
          const remainingBudgetKB = config.maxContextKB - Math.ceil(
            Object.values(changedFileContents).reduce((sum, c) => sum + Buffer.byteLength(c, 'utf-8'), 0) / 1024
          );
          if (remainingBudgetKB > 0) {
            relatedFiles = await fetchFileContents(
              octokit, owner, repo, ref, importPaths, remainingBudgetKB,
            );
          }
        }
      } catch (err) {
        console.warn('Failed to fetch related files for codebase awareness:', err);
      }
    }

    // Run review pipeline
    const result = await runReviewPipeline(
      {
        diff,
        context: {
          owner,
          repo,
          prNumber,
          prTitle: prContext.title,
          prBody: prContext.description || '',
        },
        modelId: config.model,
        lightModelId: config.lightModel || config.model,
        customStyleRules: config.customStyleRules,
        maxFindings: instSettings.maxComments || config.maxFindings,
        enabledAgents: {
          security: config.agents.security,
          bugs: config.agents.bugs,
          style: config.agents.style,
          summary: true,
          diagram: instSettings.summary?.diagram !== false,
        },
        relatedFiles,
        customAgents: config.customAgents,
      },
      { llm: deps.llm },
    );

    const durationMs = Date.now() - startTime;

    // Format comment
    const comment = formatReviewComment({
      summary: result.summary,
      findings: result.findings,
      showSummary: instSettings.summary?.prSummary !== false,
      showIssuesTable: instSettings.summary?.issuesTable !== false,
      showConfidence: instSettings.summary?.confidenceScore !== false,
      diagram: result.diagram,
      diagramCaption: result.diagramCaption,
      showDiagram: instSettings.summary?.diagram !== false,
      mergeScore: result.mergeScore,
      mergeScoreReason: result.mergeScoreReason,
      commentFooter: instSettings.commentHeader || undefined,
      reviewDetailUrl: deps.dashboardBaseUrl
        ? `${deps.dashboardBaseUrl}/dashboard/reviews/${encodeURIComponent(repoFullName)}/${prNumberCommitSha}`
        : undefined,
    });

    // Submit as a proper PR review (shows MergeWatch as a reviewer).
    // Only fall back to an issue comment if the PR review API fails.
    const reviewEvent = mergeScoreToReviewEvent(result.mergeScore);
    let commentId: number | undefined;
    let prReviewSucceeded = false;

    try {
      await dismissStaleReviews(octokit, owner, repo, prNumber);
      await submitPRReview(octokit, owner, repo, prNumber, `${BOT_COMMENT_MARKER}\n${comment}`, reviewEvent);
      prReviewSucceeded = true;
    } catch (err) {
      console.warn('Failed to submit PR review, falling back to issue comment:', err);
    }

    if (prReviewSucceeded) {
      // PR review posted successfully — delete any legacy issue comment to avoid duplicates
      const existingComment = job.existingCommentId
        || await findExistingBotComment(octokit, owner, repo, prNumber);
      if (existingComment) {
        try {
          await octokit.issues.deleteComment({ owner, repo, comment_id: existingComment });
        } catch (err) {
          console.warn('Failed to delete legacy issue comment:', err);
        }
      }
    } else {
      // PR review failed — fall back to issue comment
      if (job.existingCommentId) {
        await updateReviewComment(octokit, owner, repo, job.existingCommentId, comment);
        commentId = job.existingCommentId;
      } else {
        const existing = await findExistingBotComment(octokit, owner, repo, prNumber);
        if (existing) {
          await updateReviewComment(octokit, owner, repo, existing, comment);
          commentId = existing;
        } else {
          commentId = await postReviewComment(octokit, owner, repo, prNumber, comment);
        }
      }
    }

    // Update review record
    const topSeverity = result.findings.length > 0
      ? result.findings[0].severity
      : undefined;

    await deps.reviewStore.updateStatus(repoFullName, prNumberCommitSha, 'complete', {
      completedAt: new Date().toISOString(),
      commentId,
      model: config.model,
      durationMs,
      findingCount: result.findings.length,
      topSeverity,
      summaryText: result.summary,
      diagramText: result.diagram,
      mergeScore: result.mergeScore,
      mergeScoreReason: result.mergeScoreReason,
      findings: result.findings as any,
    });

    // Create check run
    const hasCritical = result.findings.some((f: any) => f.severity === 'critical');
    await createCheckRun(octokit, owner, repo, prContext.headBranch || '', {
      status: 'completed',
      conclusion: hasCritical ? 'failure' : 'success',
      title: `Score: ${result.mergeScore}/5`,
      summary: result.summary,
    }).catch(() => {});

    console.log(`Review complete: ${repoFullName}#${prNumber} — score ${result.mergeScore}/5, ${result.findings.length} findings, ${durationMs}ms`);
  } catch (err) {
    await deps.reviewStore.updateStatus(repoFullName, prNumberCommitSha, 'failed', {
      completedAt: new Date().toISOString(),
    });
    throw err;
  }
}
