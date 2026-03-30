import type { ReviewJobPayload, IInstallationStore, IReviewStore, IGitHubAuthProvider, ILLMProvider, FileFetchOptions, ReviewDelta } from '@mergewatch/core';
import {
  getPRDiff, getPRContext, addPRReaction, postReviewComment, updateReviewComment,
  findExistingBotComment, getCommentReactions, createCheckRun,
  formatReviewComment, runReviewPipeline, shouldSkipPR, shouldSkipByRules,
  filterDiff,
  DEFAULT_CONFIG, mergeConfig,
  BOT_COMMENT_MARKER, submitPRReview, dismissStaleReviews, mergeScoreToReviewEvent,
  buildIssueCommentUrl, formatPRReviewVerdict, buildInlineComments, extractInlineCommentTitle,
  fetchRepoConfig,
  buildWorkDoneSection, computeReviewDelta,
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
  const headSha = prContext.headSha;
  const shortSha = headSha.slice(0, 7);
  const prNumberCommitSha = `${prNumber}#${shortSha}`;

  // Atomically claim this review — prevents duplicate processing
  const now = new Date().toISOString();
  const claimed = await deps.reviewStore.claimReview({
    repoFullName,
    prNumberCommitSha,
    status: 'in_progress',
    createdAt: now,
    prTitle: prContext.title,
    prAuthor: owner,
    installationId: instId,
  });
  if (!claimed) {
    console.log(`Review already in progress for ${repoFullName}#${prNumber}@${shortSha}, skipping`);
    return;
  }

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

  // ── Rules-based skip (draft, maxFiles, ignoreLabels) ────
  const rulesSkipReason = shouldSkipByRules(config.rules, {
    isDraft: job.isDraft,
    labels: job.prLabels,
    changedFileCount: job.changedFileCount ?? prContext?.files?.length ?? 0,
    mode,
  });
  if (rulesSkipReason) {
    await deps.reviewStore.updateStatus(repoFullName, prNumberCommitSha, 'skipped', { skipReason: rulesSkipReason });
    console.log(`Rules skip ${repoFullName}#${prNumber}: ${rulesSkipReason}`);
    return;
  }

  // ── Filter excluded files from the diff ────
  const allExcludePatterns = [
    ...config.excludePatterns,
    ...config.rules.ignorePatterns,
  ];
  const { filteredDiff, excludedFiles } = filterDiff(diff, allExcludePatterns);
  if (excludedFiles.length > 0) {
    console.log(`Excluded ${excludedFiles.length} file(s) from diff: ${excludedFiles.join(', ')}`);
  }

  const startTime = Date.now();

  try {
    // Build agentic file fetch options (agents will request files they need)
    const ref = headSha;
    const fileFetchOptions: FileFetchOptions | undefined = config.codebaseAwareness
      ? {
          octokit,
          owner,
          repo,
          ref,
          maxContextKB: config.maxContextKB,
          maxRounds: config.maxFileRequestRounds,
        }
      : undefined;

    // Fetch previous reviews before pipeline (used for diagram consistency + delta computation)
    let prevComplete: typeof prevReviewsResult[number] | undefined;
    const prevReviewsResult = await deps.reviewStore.queryByPR(repoFullName, `${prNumber}#`, 5).catch((err) => {
      console.warn('Failed to fetch previous reviews:', err);
      return [] as Awaited<ReturnType<typeof deps.reviewStore.queryByPR>>;
    });
    prevComplete = prevReviewsResult.find(
      (r) => r.status === 'complete' && r.prNumberCommitSha !== prNumberCommitSha && r.findings && r.findings.length > 0,
    );

    const previousDiagram = typeof prevComplete?.diagramText === 'string' ? prevComplete.diagramText : undefined;

    // Run review pipeline
    const result = await runReviewPipeline(
      {
        diff: filteredDiff,
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
          errorHandling: config.agents.errorHandling,
          testCoverage: config.agents.testCoverage,
          commentAccuracy: config.agents.commentAccuracy,
        },
        fileFetchOptions,
        customAgents: config.customAgents,
        tone: config.ux.tone,
        customPricing: config.pricing,
        previousDiagram,
      },
      { llm: deps.llm },
    );

    const durationMs = Date.now() - startTime;

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

    // Compute cumulative cost across all reviews on this PR
    const prevCost = prevReviewsResult.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0);
    const cumulativeCostUsd = (result.estimatedCostUsd ?? 0) + prevCost;

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
      ux: config.ux,
      workDone,
      delta,
      suppressedCount: result.suppressedCount,
      enabledAgentCount: result.enabledAgentCount,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: result.estimatedCostUsd,
      cumulativeCostUsd: cumulativeCostUsd > 0 ? cumulativeCostUsd : undefined,
      durationMs,
      model: config.model,
    });

    // ── Step A: Upsert issue comment (full review — primary artifact) ──────
    const reviewEvent = mergeScoreToReviewEvent(result.mergeScore);
    let commentId: number | undefined;

    // Look up existing comment: job payload → store → API scan
    let targetCommentId = job.existingCommentId
      || (prevReviewsResult.find((r) => r.commentId && r.prNumberCommitSha !== prNumberCommitSha)?.commentId as number | undefined)
      || (await findExistingBotComment(octokit, owner, repo, prNumber)) || undefined;

    if (targetCommentId) {
      await updateReviewComment(octokit, owner, repo, targetCommentId, comment);
      commentId = targetCommentId;
    } else {
      commentId = await postReviewComment(octokit, owner, repo, prNumber, comment);
    }

    if (!commentId) {
      throw new Error('Failed to create or update issue comment');
    }

    // ── Step B: Build inline comments for critical findings ──────────────
    let inlineComments = buildInlineComments(result.findings, prContext.files);

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
    const criticalCount = result.findings.filter((f: any) => f.severity === 'critical').length;
    const warningCount = result.findings.filter((f: any) => f.severity === 'warning').length;
    const infoCount = result.findings.filter((f: any) => f.severity === 'info').length;
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
      inputTokens: result.inputTokens || undefined,
      outputTokens: result.outputTokens || undefined,
      estimatedCostUsd: result.estimatedCostUsd ?? undefined,
    });

    // Create check run
    const hasCritical = criticalCount > 0;
    await createCheckRun(octokit, owner, repo, headSha, {
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
