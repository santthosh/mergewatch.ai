import { describe, it, expect, vi } from 'vitest';
import { billingCheck } from './billing-check';
import { FREE_REVIEW_LIMIT, MIN_BALANCE_CENTS } from './constants';

// Mock the DynamoDB layer — we test billing logic, not DynamoDB calls
vi.mock('./dynamo-billing', () => ({
  getBillingFields: vi.fn(),
}));

import { getBillingFields } from './dynamo-billing';
const mockGetFields = vi.mocked(getBillingFields);

const client = {} as any;
const table = 'test-table';
const installationId = 'inst-123';

describe('billingCheck', () => {
  it('allows when freeReviewsUsed is 0 (fresh install)', async () => {
    mockGetFields.mockResolvedValue({});
    const result = await billingCheck(client, table, installationId);
    expect(result.status).toBe('allow');
    expect(result.firstBlock).toBe(false);
  });

  it('allows when freeReviewsUsed < FREE_REVIEW_LIMIT', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: FREE_REVIEW_LIMIT - 1 });
    const result = await billingCheck(client, table, installationId);
    expect(result.status).toBe('allow');
  });

  it('allows when free reviews exhausted but balance is sufficient', async () => {
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT,
      balanceCents: MIN_BALANCE_CENTS,
    });
    const result = await billingCheck(client, table, installationId);
    expect(result.status).toBe('allow');
  });

  it('allows with large balance', async () => {
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT + 100,
      balanceCents: 10000,
    });
    const result = await billingCheck(client, table, installationId);
    expect(result.status).toBe('allow');
  });

  it('blocks when free reviews exhausted and balance is 0', async () => {
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT,
      balanceCents: 0,
    });
    const result = await billingCheck(client, table, installationId);
    expect(result.status).toBe('block');
  });

  it('blocks when balance is below minimum', async () => {
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT,
      balanceCents: MIN_BALANCE_CENTS - 1,
    });
    const result = await billingCheck(client, table, installationId);
    expect(result.status).toBe('block');
  });

  it('sets firstBlock=true when no prior blockedAt', async () => {
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT,
      balanceCents: 0,
    });
    const result = await billingCheck(client, table, installationId);
    expect(result.firstBlock).toBe(true);
  });

  it('sets firstBlock=false when blockedAt already exists', async () => {
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT,
      balanceCents: 0,
      blockedAt: '2026-01-01T00:00:00Z',
    });
    const result = await billingCheck(client, table, installationId);
    expect(result.firstBlock).toBe(false);
  });

  it('blocks when balanceCents is undefined (never topped up)', async () => {
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT,
    });
    const result = await billingCheck(client, table, installationId);
    expect(result.status).toBe('block');
  });
});
