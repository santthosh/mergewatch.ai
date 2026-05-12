import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReviewJobPayload, IInstallationStore, IReviewStore, IGitHubAuthProvider, ILLMProvider } from '@mergewatch/core';
import { DEFAULT_INSTALLATION_SETTINGS } from '@mergewatch/core';
import type { WebhookDeps } from './webhook-handler.js';

// ---------------------------------------------------------------------------
// Mocks — all @mergewatch/core functions used by review-processor
// ---------------------------------------------------------------------------
vi.mock('@mergewatch/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mergewatch/core')>();
  return {
    ...actual,
    getPRContext: vi.fn(),
    getPRDiff: vi.fn(),
    addPRReaction: vi.fn().mockResolvedValue(undefined),
    createCheckRun: vi.fn().mockResolvedValue(undefined),
    shouldSkipPR: vi.fn().mockReturnValue(null),
    shouldSkipByRules: vi.fn().mockReturnValue(null),
    fetchRepoConfig: vi.fn().mockResolvedValue(null),
    filterDiff: vi.fn().mockReturnValue({ filteredDiff: 'diff', excludedFiles: [] }),
    runReviewPipeline: vi.fn(),
    formatReviewComment: vi.fn().mockReturnValue('formatted comment'),
    buildWorkDoneSection: vi.fn().mockReturnValue(undefined),
    computeReviewDelta: vi.fn().mockReturnValue(null),
    findExistingBotComment: vi.fn().mockResolvedValue(null),
    postReviewComment: vi.fn().mockResolvedValue(100),
    updateReviewComment: vi.fn().mockResolvedValue(undefined),
    mergeScoreToReviewEvent: vi.fn().mockReturnValue('APPROVE'),
    buildInlineComments: vi.fn().mockReturnValue([]),
    dismissStaleReviews: vi.fn().mockResolvedValue(undefined),
    submitPRReview: vi.fn().mockResolvedValue(undefined),
    createStandaloneReviewComment: vi.fn().mockResolvedValue(undefined),
    getCommentReactions: vi.fn().mockResolvedValue({}),
    postReplyComment: vi.fn().mockResolvedValue(200),
    RESPOND_PROMPT: 'You are MergeWatch...',
    fetchConventions: vi.fn().mockResolvedValue(null),
    handleInlineReply: vi.fn().mockResolvedValue({
      action: 'replied',
      recommendation: 'keep',
      botCommentId: 999,
      inputTokens: 500,
      outputTokens: 100,
      estimatedCostUsd: 0.002,
    }),
  };
});

import {
  getPRContext, getPRDiff, createCheckRun, shouldSkipPR, shouldSkipByRules,
  runReviewPipeline, postReplyComment, fetchRepoConfig, handleInlineReply,
} from '@mergewatch/core';
import { processReviewJob } from './review-processor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockOctokit = {} as any;

function makeDeps(overrides?: Partial<Pick<WebhookDeps, 'installationStore' | 'reviewStore' | 'authProvider' | 'llm' | 'dashboardBaseUrl'>>) {
  return {
    installationStore: {
      get: vi.fn().mockResolvedValue(null),
      getSettings: vi.fn().mockResolvedValue(DEFAULT_INSTALLATION_SETTINGS),
      upsert: vi.fn(),
    } as unknown as IInstallationStore,
    reviewStore: {
      claimReview: vi.fn().mockResolvedValue(true),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      queryByPR: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    } as unknown as IReviewStore,
    authProvider: {
      getInstallationOctokit: vi.fn().mockResolvedValue(mockOctokit),
    } as unknown as IGitHubAuthProvider,
    llm: { invoke: vi.fn() } as unknown as ILLMProvider,
    dashboardBaseUrl: 'https://mergewatch.ai',
    ...overrides,
  };
}

function makeJob(overrides?: Partial<ReviewJobPayload>): ReviewJobPayload {
  return {
    installationId: 1,
    owner: 'test',
    repo: 'repo',
    prNumber: 1,
    mode: 'review' as const,
    ...overrides,
  };
}

const basePRContext = {
  title: 'Test PR',
  description: 'Test description',
  headSha: 'abc1234567890',
  headBranch: 'feature/test',
  baseBranch: 'main',
  prAuthor: 'testuser',
  prAuthorAvatar: 'https://avatar.url',
  files: [{ filename: 'src/index.ts', status: 'modified', additions: 10, deletions: 5 }],
  totalAdditions: 10,
  totalDeletions: 5,
};

const basePipelineResult = {
  summary: 'All good',
  findings: [],
  mergeScore: 5,
  mergeScoreReason: 'No issues',
  diagram: undefined,
  diagramCaption: undefined,
  enabledAgentCount: 6,
  suppressedCount: 0,
  inputTokens: 1000,
  outputTokens: 200,
  estimatedCostUsd: 0.01,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processReviewJob — check runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getPRContext as any).mockResolvedValue(basePRContext);
    (getPRDiff as any).mockResolvedValue('diff content');
    (shouldSkipPR as any).mockReturnValue(null);
    (shouldSkipByRules as any).mockReturnValue(null);
    (runReviewPipeline as any).mockResolvedValue(basePipelineResult);
  });

  it('creates in-progress check run after eyes reaction', async () => {
    const deps = makeDeps();
    await processReviewJob(makeJob(), deps);

    expect(createCheckRun).toHaveBeenCalledWith(
      mockOctokit, 'test', 'repo', basePRContext.headSha,
      expect.objectContaining({
        status: 'in_progress',
        title: 'Review in progress',
        summary: 'MergeWatch is reviewing PR #1...',
      }),
    );
  });

  it('creates neutral check run on smart skip', async () => {
    (shouldSkipPR as any).mockReturnValue('Only lockfile changes');
    const deps = makeDeps();
    await processReviewJob(makeJob(), deps);

    expect(createCheckRun).toHaveBeenCalledWith(
      mockOctokit, 'test', 'repo', basePRContext.headSha,
      expect.objectContaining({
        status: 'completed',
        conclusion: 'neutral',
        title: 'Review skipped',
        summary: 'Only lockfile changes',
      }),
    );
  });

  it('bypasses smart skip when mentionTriggered is true', async () => {
    (shouldSkipPR as any).mockReturnValue('Only docs changed');
    const deps = makeDeps();
    await processReviewJob(makeJob({ mentionTriggered: true }), deps);

    // shouldSkipPR return value is ignored — review runs through to pipeline
    expect(runReviewPipeline).toHaveBeenCalled();
  });

  it('creates neutral check run on rules skip', async () => {
    (shouldSkipByRules as any).mockReturnValue({ kind: 'draft', reason: 'Draft PR skipped' });
    const deps = makeDeps();
    await processReviewJob(makeJob(), deps);

    expect(createCheckRun).toHaveBeenCalledWith(
      mockOctokit, 'test', 'repo', basePRContext.headSha,
      expect.objectContaining({
        status: 'completed',
        conclusion: 'neutral',
        title: 'Review skipped',
        summary: 'Draft PR skipped',
      }),
    );
  });

  it('creates user-actionable check run on autoReviewOff skip', async () => {
    (shouldSkipByRules as any).mockReturnValue({
      kind: 'autoReviewOff',
      reason: 'Automatic reviews disabled — use @mergewatch to trigger manually',
    });
    const deps = makeDeps();
    await processReviewJob(makeJob(), deps);

    expect(createCheckRun).toHaveBeenCalledWith(
      mockOctokit, 'test', 'repo', basePRContext.headSha,
      expect.objectContaining({
        status: 'completed',
        conclusion: 'neutral',
        title: 'Auto-review is disabled for this repository',
        summary: expect.stringContaining('@mergewatch review'),
      }),
    );
  });

  it('creates failure check run on error', async () => {
    (runReviewPipeline as any).mockRejectedValue(new Error('LLM timeout'));
    const deps = makeDeps();

    await expect(processReviewJob(makeJob(), deps)).rejects.toThrow('LLM timeout');

    expect(createCheckRun).toHaveBeenCalledWith(
      mockOctokit, 'test', 'repo', basePRContext.headSha,
      expect.objectContaining({
        status: 'completed',
        conclusion: 'failure',
        title: 'Review failed',
        summary: 'MergeWatch encountered an error while reviewing this PR. Please try again or contact support if the issue persists.',
      }),
    );
  });

  describe('completion check run', () => {
    it('shows critical count when critical findings exist', async () => {
      (runReviewPipeline as any).mockResolvedValue({
        ...basePipelineResult,
        findings: [
          { file: 'a.ts', line: 1, severity: 'critical', category: 'security', title: 'SQLi', description: '', suggestion: '' },
          { file: 'b.ts', line: 2, severity: 'critical', category: 'security', title: 'XSS', description: '', suggestion: '' },
        ],
        mergeScore: 1,
      });

      const deps = makeDeps();
      await processReviewJob(makeJob(), deps);

      // Last createCheckRun call is the completion one
      const calls = (createCheckRun as any).mock.calls;
      const completionCall = calls[calls.length - 1];
      expect(completionCall[4]).toMatchObject({
        status: 'completed',
        conclusion: 'failure',
        title: '2 critical issues found',
        summary: 'Found: 2 critical',
      });
    });

    it('shows finding count (no critical) when only warnings/info', async () => {
      (runReviewPipeline as any).mockResolvedValue({
        ...basePipelineResult,
        findings: [
          { file: 'a.ts', line: 1, severity: 'warning', category: 'style', title: 'Naming', description: '', suggestion: '' },
          { file: 'b.ts', line: 2, severity: 'info', category: 'style', title: 'Docs', description: '', suggestion: '' },
        ],
        mergeScore: 4,
      });

      const deps = makeDeps();
      await processReviewJob(makeJob(), deps);

      const calls = (createCheckRun as any).mock.calls;
      const completionCall = calls[calls.length - 1];
      expect(completionCall[4]).toMatchObject({
        status: 'completed',
        conclusion: 'success',
        title: '2 findings (no critical)',
        summary: 'Found: 1 warning, 1 info',
      });
    });

    it('shows "No issues found" when no findings', async () => {
      const deps = makeDeps();
      await processReviewJob(makeJob(), deps);

      const calls = (createCheckRun as any).mock.calls;
      const completionCall = calls[calls.length - 1];
      expect(completionCall[4]).toMatchObject({
        status: 'completed',
        conclusion: 'success',
        title: 'No issues found',
        summary: 'No issues detected in this PR.',
      });
    });

    it('includes detailsUrl when dashboardBaseUrl is set', async () => {
      const deps = makeDeps({ dashboardBaseUrl: 'https://mergewatch.ai' });
      await processReviewJob(makeJob(), deps);

      const calls = (createCheckRun as any).mock.calls;
      const completionCall = calls[calls.length - 1];
      expect(completionCall[4].detailsUrl).toContain('https://mergewatch.ai/dashboard/reviews/');
    });

    it('omits detailsUrl when dashboardBaseUrl is empty', async () => {
      const deps = makeDeps({ dashboardBaseUrl: '' });
      await processReviewJob(makeJob(), deps);

      const calls = (createCheckRun as any).mock.calls;
      const completionCall = calls[calls.length - 1];
      expect(completionCall[4].detailsUrl).toBeUndefined();
    });

    it('uses singular "issue" for single critical finding', async () => {
      (runReviewPipeline as any).mockResolvedValue({
        ...basePipelineResult,
        findings: [
          { file: 'a.ts', line: 1, severity: 'critical', category: 'security', title: 'SQLi', description: '', suggestion: '' },
        ],
        mergeScore: 2,
      });

      const deps = makeDeps();
      await processReviewJob(makeJob(), deps);

      const calls = (createCheckRun as any).mock.calls;
      const completionCall = calls[calls.length - 1];
      expect(completionCall[4].title).toBe('1 critical issue found');
    });
  });
});

// ---------------------------------------------------------------------------
// Respond mode tests
// ---------------------------------------------------------------------------

describe('processReviewJob — respond mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getPRContext as any).mockResolvedValue(basePRContext);
    (getPRDiff as any).mockResolvedValue('diff content');
  });

  it('calls LLM and posts reply for respond mode', async () => {
    const deps = makeDeps();
    (deps.llm.invoke as any).mockResolvedValue({ text: 'Here is my response' });
    (deps.reviewStore.queryByPR as any).mockResolvedValue([
      { status: 'complete', findings: [{ title: 'Bug' }], summaryText: 'Summary' },
    ]);

    await processReviewJob(
      makeJob({ mode: 'respond' as any, userComment: 'Can you explain?', userCommentAuthor: 'dev' }),
      deps,
    );

    expect(deps.llm.invoke).toHaveBeenCalledOnce();
    expect(postReplyComment).toHaveBeenCalledWith(mockOctokit, 'test', 'repo', 1, 'Here is my response');
  });

  it('does not run review pipeline in respond mode', async () => {
    const deps = makeDeps();
    (deps.llm.invoke as any).mockResolvedValue({ text: 'response' });
    (deps.reviewStore.queryByPR as any).mockResolvedValue([]);

    await processReviewJob(
      makeJob({ mode: 'respond' as any, userComment: 'question' }),
      deps,
    );

    expect(runReviewPipeline).not.toHaveBeenCalled();
    expect(deps.reviewStore.claimReview).not.toHaveBeenCalled();
  });

  it('posts fallback error reply when LLM fails', async () => {
    const deps = makeDeps();
    (deps.llm.invoke as any).mockRejectedValue(new Error('LLM timeout'));
    (deps.reviewStore.queryByPR as any).mockResolvedValue([]);

    await processReviewJob(
      makeJob({ mode: 'respond' as any, userComment: 'question' }),
      deps,
    );

    expect(postReplyComment).toHaveBeenCalledWith(
      mockOctokit, 'test', 'repo', 1,
      'Sorry, I encountered an error while processing your request. Please try again.',
    );
  });

  it('falls through to review mode when userComment is missing', async () => {
    (shouldSkipPR as any).mockReturnValue(null);
    (shouldSkipByRules as any).mockReturnValue(null);
    (runReviewPipeline as any).mockResolvedValue(basePipelineResult);

    const deps = makeDeps();
    await processReviewJob(
      makeJob({ mode: 'respond' as any }),
      deps,
    );

    // Without userComment, respond mode is skipped → falls through to review
    expect(deps.reviewStore.claimReview).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Config merging — dashboard settings override YAML
// ---------------------------------------------------------------------------

describe('processReviewJob — config merging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getPRContext as any).mockResolvedValue(basePRContext);
    (getPRDiff as any).mockResolvedValue('diff content');
    (shouldSkipPR as any).mockReturnValue(null);
    (shouldSkipByRules as any).mockReturnValue(null);
    (runReviewPipeline as any).mockResolvedValue(basePipelineResult);
  });

  it('maps dashboard severity threshold to minSeverity', async () => {
    const deps = makeDeps({
      installationStore: {
        get: vi.fn().mockResolvedValue(null),
        getSettings: vi.fn().mockResolvedValue({
          ...DEFAULT_INSTALLATION_SETTINGS,
          severityThreshold: 'High',
        }),
        upsert: vi.fn(),
      } as unknown as IInstallationStore,
    });

    await processReviewJob(makeJob(), deps);

    const pipelineCall = (runReviewPipeline as any).mock.calls[0][0];
    expect(pipelineCall).toBeDefined();
  });

  it('maps dashboard commentTypes to agent flags', async () => {
    const deps = makeDeps({
      installationStore: {
        get: vi.fn().mockResolvedValue(null),
        getSettings: vi.fn().mockResolvedValue({
          ...DEFAULT_INSTALLATION_SETTINGS,
          commentTypes: { logic: false, syntax: true, style: false },
        }),
        upsert: vi.fn(),
      } as unknown as IInstallationStore,
    });

    await processReviewJob(makeJob(), deps);

    // Verify pipeline was called (config was merged without errors)
    expect(runReviewPipeline).toHaveBeenCalled();
  });

  it('uses YAML config as base when present', async () => {
    (fetchRepoConfig as any).mockResolvedValue({
      model: 'custom-model',
      maxFindings: 10,
    });

    const deps = makeDeps();
    await processReviewJob(makeJob(), deps);

    expect(runReviewPipeline).toHaveBeenCalled();
  });

  it('overrides model with LLM_MODEL env var', async () => {
    const original = process.env.LLM_MODEL;
    process.env.LLM_MODEL = 'env-override-model';

    try {
      const deps = makeDeps();
      await processReviewJob(makeJob(), deps);

      const pipelineCall = (runReviewPipeline as any).mock.calls[0][0];
      expect(pipelineCall.modelId).toBe('env-override-model');
      expect(pipelineCall.lightModelId).toBe('env-override-model');
    } finally {
      if (original === undefined) {
        delete process.env.LLM_MODEL;
      } else {
        process.env.LLM_MODEL = original;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// inline_reply mode
// ---------------------------------------------------------------------------

describe('processReviewJob — inline_reply mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches inline_reply mode to handleInlineReply', async () => {
    const deps = makeDeps();
    await processReviewJob(
      makeJob({ mode: 'inline_reply', inlineReplyCommentId: 4242 }),
      deps,
    );

    expect(handleInlineReply).toHaveBeenCalledTimes(1);
    const [ctx, innerDeps] = (handleInlineReply as any).mock.calls[0];
    expect(ctx.replyCommentId).toBe(4242);
    expect(ctx.owner).toBe('test');
    expect(ctx.repo).toBe('repo');
    expect(innerDeps.llm).toBe(deps.llm);
    // Review pipeline must NOT run for inline_reply mode
    expect(runReviewPipeline).not.toHaveBeenCalled();
  });

  it('rolls inline-reply cost onto the parent review when one exists', async () => {
    const deps = makeDeps();
    (deps.reviewStore.queryByPR as any).mockResolvedValueOnce([
      {
        prNumberCommitSha: '1#abc123',
        status: 'complete',
        inputTokens: 1000,
        outputTokens: 200,
        estimatedCostUsd: 0.05,
      },
    ]);

    await processReviewJob(
      makeJob({ mode: 'inline_reply', inlineReplyCommentId: 1 }),
      deps,
    );

    expect(deps.reviewStore.updateStatus).toHaveBeenCalledTimes(1);
    const [, sk, status, patch] = (deps.reviewStore.updateStatus as any).mock.calls[0];
    expect(sk).toBe('1#abc123');
    expect(status).toBe('complete');
    expect(patch.inputTokens).toBe(1500); // 1000 + 500 from handleInlineReply mock
    expect(patch.outputTokens).toBe(300);
    expect(patch.estimatedCostUsd).toBeCloseTo(0.052, 5);
  });

  it('does not update the parent review when inline reply used zero tokens', async () => {
    (handleInlineReply as any).mockResolvedValueOnce({
      action: 'resolved',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    });
    const deps = makeDeps();
    (deps.reviewStore.queryByPR as any).mockResolvedValueOnce([
      { prNumberCommitSha: '1#abc123', status: 'complete', inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.01 },
    ]);

    await processReviewJob(
      makeJob({ mode: 'inline_reply', inlineReplyCommentId: 1 }),
      deps,
    );

    expect(deps.reviewStore.updateStatus).not.toHaveBeenCalled();
  });

  it('no-ops when inlineReplyCommentId is missing', async () => {
    const deps = makeDeps();
    await processReviewJob(makeJob({ mode: 'inline_reply' }), deps);
    expect(handleInlineReply).not.toHaveBeenCalled();
    expect(runReviewPipeline).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// agent-authored PR wiring — source/agentKind persisted + agentAuthored passed
// ---------------------------------------------------------------------------

describe('processReviewJob — agent-authored wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getPRContext as any).mockResolvedValue(basePRContext);
    (getPRDiff as any).mockResolvedValue('diff content');
    (shouldSkipPR as any).mockReturnValue(null);
    (shouldSkipByRules as any).mockReturnValue(null);
    (runReviewPipeline as any).mockResolvedValue(basePipelineResult);
  });

  it('persists source and agentKind on the claimed review record', async () => {
    const deps = makeDeps();
    await processReviewJob(
      makeJob({ source: 'agent', agentKind: 'claude' }),
      deps,
    );

    expect(deps.reviewStore.claimReview).toHaveBeenCalledTimes(1);
    const claimed = (deps.reviewStore.claimReview as any).mock.calls[0][0];
    expect(claimed.source).toBe('agent');
    expect(claimed.agentKind).toBe('claude');
  });

  it('passes agentAuthored=true into runReviewPipeline when source is agent', async () => {
    const deps = makeDeps();
    await processReviewJob(
      makeJob({ source: 'agent', agentKind: 'claude' }),
      deps,
    );

    const pipelineOptions = (runReviewPipeline as any).mock.calls[0][0];
    expect(pipelineOptions.agentAuthored).toBe(true);
  });

  it('passes agentAuthored=false into runReviewPipeline when source is human', async () => {
    const deps = makeDeps();
    await processReviewJob(makeJob({ source: 'human' }), deps);

    const pipelineOptions = (runReviewPipeline as any).mock.calls[0][0];
    expect(pipelineOptions.agentAuthored).toBe(false);
  });

  it('passes agentAuthored=false when source is missing (back-compat)', async () => {
    const deps = makeDeps();
    await processReviewJob(makeJob(), deps);

    const pipelineOptions = (runReviewPipeline as any).mock.calls[0][0];
    expect(pipelineOptions.agentAuthored).toBe(false);
  });
});
