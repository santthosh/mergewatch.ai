import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReviewItem } from '@mergewatch/core';
import { handleGetReviewStatus } from './get-review-status.js';
import type { McpServerDeps } from '../server-deps.js';
import type { AuthResolution } from '../middleware/auth.js';

function makeDeps(rows: ReviewItem[] | Error): McpServerDeps {
  const queryByPR = vi.fn(async () => {
    if (rows instanceof Error) throw rows;
    return rows;
  });
  return {
    llm: {} as any,
    authProvider: {} as any,
    installationStore: {} as any,
    reviewStore: { upsert: vi.fn(), claimReview: vi.fn(), updateStatus: vi.fn(), queryByPR } as any,
    apiKeyStore: {} as any,
    sessionStore: {} as any,
    billing: { check: vi.fn(), record: vi.fn() } as any,
    ddbClient: {} as any,
    installationsTable: 'installations',
  };
}

const auth: AuthResolution = { installationId: '1', scope: 'all', keyHash: 'h' };

describe('handleGetReviewStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the latest review when found', async () => {
    const row = {
      repoFullName: 'acme/web',
      prNumberCommitSha: '42#abc1234',
      status: 'complete',
      createdAt: '2026-04-19T00:00:00Z',
    } as ReviewItem;
    const deps = makeDeps([row]);
    const out = await handleGetReviewStatus({ repo: 'acme/web', prNumber: 42 }, deps, auth);
    expect(out.found).toBe(true);
    expect(out.review).toEqual(row);
    expect(deps.reviewStore.queryByPR).toHaveBeenCalledWith('acme/web', '42#', 1);
  });

  it('returns found=false when no review exists', async () => {
    const deps = makeDeps([]);
    const out = await handleGetReviewStatus({ repo: 'acme/web', prNumber: 99 }, deps, auth);
    expect(out.found).toBe(false);
    expect(out.review).toBeUndefined();
  });

  it('rejects bad repo format', async () => {
    const deps = makeDeps([]);
    await expect(
      handleGetReviewStatus({ repo: 'invalid', prNumber: 1 }, deps, auth),
    ).rejects.toThrow(/owner\/repo/);
  });

  it('rejects non-positive prNumber', async () => {
    const deps = makeDeps([]);
    await expect(
      handleGetReviewStatus({ repo: 'acme/web', prNumber: 0 }, deps, auth),
    ).rejects.toThrow(/positive/);
    await expect(
      handleGetReviewStatus({ repo: 'acme/web', prNumber: -3 }, deps, auth),
    ).rejects.toThrow(/positive/);
  });

  it('rejects out-of-scope repo', async () => {
    const deps = makeDeps([]);
    await expect(
      handleGetReviewStatus(
        { repo: 'other/repo', prNumber: 1 },
        deps,
        { installationId: '1', scope: ['acme/web'], keyHash: 'h' },
      ),
    ).rejects.toThrow(/scope/);
  });
});
