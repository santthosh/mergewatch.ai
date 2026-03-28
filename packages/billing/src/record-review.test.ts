import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordReview } from './record-review';
import { FREE_REVIEW_LIMIT } from './constants';

// Mock the DynamoDB layer
vi.mock('./dynamo-billing', () => ({
  getBillingFields: vi.fn(),
  incrementFreeReviewsUsed: vi.fn(),
  deductBalance: vi.fn(),
}));

import { getBillingFields, incrementFreeReviewsUsed, deductBalance } from './dynamo-billing';
const mockGetFields = vi.mocked(getBillingFields);
const mockIncrement = vi.mocked(incrementFreeReviewsUsed);
const mockDeduct = vi.mocked(deductBalance);

const client = {} as any;
const table = 'test-table';
const installationId = 'inst-123';

describe('recordReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('increments free counter when on free tier', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: 2 });

    await recordReview(client, table, installationId, 0.02);

    expect(mockIncrement).toHaveBeenCalledWith(client, table, installationId, FREE_REVIEW_LIMIT);
    expect(mockDeduct).not.toHaveBeenCalled();
  });

  it('increments free counter when freeReviewsUsed is undefined (first review)', async () => {
    mockGetFields.mockResolvedValue({});

    await recordReview(client, table, installationId, 0.01);

    expect(mockIncrement).toHaveBeenCalled();
    expect(mockDeduct).not.toHaveBeenCalled();
  });

  it('deducts balance when free reviews exhausted', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: FREE_REVIEW_LIMIT, balanceCents: 1000 });

    await recordReview(client, table, installationId, 0.02);

    expect(mockIncrement).not.toHaveBeenCalled();
    expect(mockDeduct).toHaveBeenCalledWith(client, table, installationId, expect.any(Number));
    // Verify amount is correct: 0.02 + 0.005 + 0.008 = 0.033 → 4 cents
    expect(mockDeduct).toHaveBeenCalledWith(client, table, installationId, 4);
  });

  it('deducts correct amount for larger LLM cost', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: FREE_REVIEW_LIMIT, balanceCents: 5000 });

    await recordReview(client, table, installationId, 0.50);

    // 0.50 + 0.005 + 0.20 = 0.705 → 71 cents
    expect(mockDeduct).toHaveBeenCalledWith(client, table, installationId, 71);
  });

  it('does not deduct for free tier even with high LLM cost', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: FREE_REVIEW_LIMIT - 1 });

    await recordReview(client, table, installationId, 1.00);

    expect(mockIncrement).toHaveBeenCalled();
    expect(mockDeduct).not.toHaveBeenCalled();
  });
});
