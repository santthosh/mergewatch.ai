/**
 * Integration-level tests for the billing gate flow as wired in review-agent.ts.
 *
 * Verifies the composed behavior: billingCheck → postBlockedCheckRun →
 * ensureBillingIssue → 402, matching the review-agent handler logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { billingCheck } from './billing-check';
import { postBlockedCheckRun, ensureBillingIssue } from './block-notify';
import { FREE_REVIEW_LIMIT } from './constants';

// Mock DynamoDB layer
vi.mock('./dynamo-billing', () => ({
  getBillingFields: vi.fn(),
  updateBillingFields: vi.fn(),
}));

import { getBillingFields, updateBillingFields } from './dynamo-billing';
const mockGetFields = vi.mocked(getBillingFields);
const mockUpdateFields = vi.mocked(updateBillingFields);

const client = { send: vi.fn().mockResolvedValue({}) } as any;
const table = 'test-table';
const installationId = 'inst-123';
const owner = 'acme';
const repo = 'webapp';
const headSha = 'abc1234';

function createMockOctokit() {
  return {
    checks: { create: vi.fn().mockResolvedValue({}) },
    issues: {
      create: vi.fn().mockResolvedValue({ data: { number: 99 } }),
      update: vi.fn().mockResolvedValue({}),
      createComment: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

/**
 * Simulates the billing gate logic from review-agent.ts:
 *   1. billingCheck → allow or block
 *   2. if block → postBlockedCheckRun
 *   3. if firstBlock → ensureBillingIssue + updateBillingFields
 *   4. return 402
 */
async function runBillingGate(octokit: any) {
  const billing = await billingCheck(client, table, installationId);
  if (billing.status === 'block') {
    await postBlockedCheckRun(octokit, owner, repo, headSha);

    if (billing.firstBlock) {
      await ensureBillingIssue(octokit, owner, repo, installationId, client, table);
      await updateBillingFields(client, table, installationId, {
        blockedAt: expect.any(String),
      });
    }

    return { statusCode: 402 };
  }
  return { statusCode: 200 };
}

describe('billing gate (integrated flow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.send.mockResolvedValue({});
  });

  it('allows review when on free tier', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: 2 });
    const octokit = createMockOctokit();

    const result = await runBillingGate(octokit);

    expect(result.statusCode).toBe(200);
    expect(octokit.checks.create).not.toHaveBeenCalled();
    expect(octokit.issues.create).not.toHaveBeenCalled();
  });

  it('allows review when paid with sufficient balance', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: FREE_REVIEW_LIMIT, balanceCents: 1000 });
    const octokit = createMockOctokit();

    const result = await runBillingGate(octokit);

    expect(result.statusCode).toBe(200);
    expect(octokit.checks.create).not.toHaveBeenCalled();
  });

  it('blocks with check run + issue on first block', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: FREE_REVIEW_LIMIT, balanceCents: 0 });
    const octokit = createMockOctokit();

    const result = await runBillingGate(octokit);

    expect(result.statusCode).toBe(402);
    // Check run created
    expect(octokit.checks.create).toHaveBeenCalledWith(
      expect.objectContaining({ conclusion: 'action_required' }),
    );
    // GitHub issue created (firstBlock=true because no blockedAt)
    expect(octokit.issues.create).toHaveBeenCalled();
  });

  it('blocks with check run only on subsequent blocks (no duplicate issue)', async () => {
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT,
      balanceCents: 0,
      blockedAt: '2026-01-01T00:00:00Z',
    });
    const octokit = createMockOctokit();

    const result = await runBillingGate(octokit);

    expect(result.statusCode).toBe(402);
    expect(octokit.checks.create).toHaveBeenCalled();
    // No issue created (firstBlock=false)
    expect(octokit.issues.create).not.toHaveBeenCalled();
    // No blockedAt update
    expect(mockUpdateFields).not.toHaveBeenCalled();
  });
});
