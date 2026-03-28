import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { FREE_REVIEW_LIMIT } from './constants';
import { calculateReviewCost } from './cost';
import { getBillingFields, incrementFreeReviewsUsed, deductBalance } from './dynamo-billing';

/**
 * Record a completed review against billing.
 *
 * - Free tier: atomically increment freeReviewsUsed
 * - Paid tier: atomically deduct totalCents from balanceCents
 *
 * Stripe balance sync and auto-reload will be wired in Phase 2.
 */
export async function recordReview(
  client: DynamoDBDocumentClient,
  table: string,
  installationId: string,
  estimatedCostUsd: number,
): Promise<void> {
  const fields = await getBillingFields(client, table, installationId);

  if ((fields.freeReviewsUsed ?? 0) < FREE_REVIEW_LIMIT) {
    // Free tier — just bump the counter
    await incrementFreeReviewsUsed(client, table, installationId, FREE_REVIEW_LIMIT);
    return;
  }

  // Paid tier — deduct from balance
  const { totalCents } = calculateReviewCost(estimatedCostUsd);
  await deductBalance(client, table, installationId, totalCents);
}
