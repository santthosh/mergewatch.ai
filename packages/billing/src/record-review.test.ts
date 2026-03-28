import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordReview } from './record-review';
import { FREE_REVIEW_LIMIT } from './constants';

// Mock the DynamoDB layer
vi.mock('./dynamo-billing', () => ({
  getBillingFields: vi.fn(),
  incrementFreeReviewsUsed: vi.fn(),
  deductBalanceAndRecordUsage: vi.fn(),
}));

import { getBillingFields, incrementFreeReviewsUsed, deductBalanceAndRecordUsage } from './dynamo-billing';
const mockGetFields = vi.mocked(getBillingFields);
const mockIncrement = vi.mocked(incrementFreeReviewsUsed);
const mockDeductAndRecord = vi.mocked(deductBalanceAndRecordUsage);

const client = {} as any;
const table = 'test-table';
const installationId = 'inst-123';
const reviewKey = '42#abc1234';

describe('recordReview', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('increments free counter when on free tier', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: 2 });

    await recordReview(client, table, installationId, 0.02, reviewKey);

    expect(mockIncrement).toHaveBeenCalledWith(client, table, installationId, FREE_REVIEW_LIMIT);
    expect(mockDeductAndRecord).not.toHaveBeenCalled();
  });

  it('increments free counter when freeReviewsUsed is undefined (first review)', async () => {
    mockGetFields.mockResolvedValue({});

    await recordReview(client, table, installationId, 0.01, reviewKey);

    expect(mockIncrement).toHaveBeenCalled();
    expect(mockDeductAndRecord).not.toHaveBeenCalled();
  });

  it('deducts balance and records usage when free reviews exhausted', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: FREE_REVIEW_LIMIT, balanceCents: 1000 });

    await recordReview(client, table, installationId, 0.02, reviewKey);

    expect(mockIncrement).not.toHaveBeenCalled();
    expect(mockDeductAndRecord).toHaveBeenCalledWith(
      client, table, installationId,
      expect.objectContaining({
        amountCents: 4, // 0.02 + 0.005 + 0.008 = 0.033 → ceil = 4
        prCount: 1,
      }),
    );
  });

  it('deducts correct amount for larger LLM cost', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: FREE_REVIEW_LIMIT, balanceCents: 5000 });

    await recordReview(client, table, installationId, 0.50, reviewKey);

    // 0.50 + 0.005 + 0.20 = 0.705 → 71 cents
    expect(mockDeductAndRecord).toHaveBeenCalledWith(
      client, table, installationId,
      expect.objectContaining({ amountCents: 71 }),
    );
  });

  it('does not deduct for free tier even with high LLM cost', async () => {
    mockGetFields.mockResolvedValue({ freeReviewsUsed: FREE_REVIEW_LIMIT - 1 });

    await recordReview(client, table, installationId, 1.00, reviewKey);

    expect(mockIncrement).toHaveBeenCalled();
    expect(mockDeductAndRecord).not.toHaveBeenCalled();
  });

  it('debits Stripe balance when stripe client and customer ID are present', async () => {
    const mockStripe = {
      customers: {
        createBalanceTransaction: vi.fn().mockResolvedValue({}),
      },
    } as any;
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT,
      balanceCents: 1000,
      stripeCustomerId: 'cus_123',
    });

    await recordReview(client, table, installationId, 0.02, reviewKey, mockStripe);

    expect(mockStripe.customers.createBalanceTransaction).toHaveBeenCalledWith(
      'cus_123',
      expect.objectContaining({ amount: 4, currency: 'usd' }),
      expect.objectContaining({ idempotencyKey: `review-billing-${installationId}-${reviewKey}` }),
    );
  });

  it('does not call Stripe when no stripe client provided', async () => {
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT,
      balanceCents: 1000,
      stripeCustomerId: 'cus_123',
    });

    // No stripe param
    await recordReview(client, table, installationId, 0.02, reviewKey);

    // No error thrown, Stripe not called
    expect(mockDeductAndRecord).toHaveBeenCalled();
  });

  it('does not call Stripe when no customer ID exists', async () => {
    const mockStripe = {
      customers: {
        createBalanceTransaction: vi.fn(),
      },
    } as any;
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT,
      balanceCents: 1000,
    });

    await recordReview(client, table, installationId, 0.02, reviewKey, mockStripe);

    expect(mockStripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
  });

  it('logs warning but does not throw when Stripe debit fails', async () => {
    const mockStripe = {
      customers: {
        createBalanceTransaction: vi.fn().mockRejectedValue(new Error('Stripe error')),
      },
    } as any;
    mockGetFields.mockResolvedValue({
      freeReviewsUsed: FREE_REVIEW_LIMIT,
      balanceCents: 1000,
      stripeCustomerId: 'cus_123',
    });

    // Should not throw
    await recordReview(client, table, installationId, 0.02, reviewKey, mockStripe);

    // DynamoDB deduction still happened
    expect(mockDeductAndRecord).toHaveBeenCalled();
  });
});
