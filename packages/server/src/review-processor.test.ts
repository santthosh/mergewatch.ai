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
    buildIssueCommentUrl: vi.fn().mockReturnValue('https://github.com/test/repo/pull/1#comment-100'),
    formatPRReviewVerdict: vi.fn().mockReturnValue('verdict body'),
    buildInlineComments: vi.fn().mockReturnValue([]),
    dismissStaleReviews: vi.fn().mockResolvedValue(undefined),
    submitPRReview: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  getPRContext, getPRDiff, createCheckRun, shouldSkipPR, shouldSkipByRules,
  runReviewPipeline,
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

  it('creates neutral check run on rules skip', async () => {
    (shouldSkipByRules as any).mockReturnValue('Draft PR skipped');
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
