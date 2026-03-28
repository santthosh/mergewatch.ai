import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getBillingFields } from './dynamo-billing';
import { FREE_REVIEW_LIMIT, MIN_BALANCE_CENTS } from './constants';

export interface BillingCheckResult {
  /** Whether the review is allowed. */
  status: 'allow' | 'block';
  /**
   * True when this is the first time the installation is being blocked
   * (no prior blockedAt timestamp). Used to decide whether to file a GitHub Issue.
   */
  firstBlock: boolean;
}

/**
 * Determine whether an installation is allowed to run a review.
 *
 * Decision tree:
 *   1. freeReviewsUsed < FREE_REVIEW_LIMIT → allow (free tier)
 *   2. balanceCents >= MIN_BALANCE_CENTS → allow (paid)
 *   3. Otherwise → block
 */
export async function billingCheck(
  client: DynamoDBDocumentClient,
  table: string,
  installationId: string,
): Promise<BillingCheckResult> {
  const fields = await getBillingFields(client, table, installationId);

  const freeUsed = fields.freeReviewsUsed ?? 0;
  const balanceCents = fields.balanceCents ?? 0;

  // Free tier path
  if (freeUsed < FREE_REVIEW_LIMIT) {
    console.log(`[billing] allow install=${installationId} reason=free_tier used=${freeUsed}/${FREE_REVIEW_LIMIT}`);
    return { status: 'allow', firstBlock: false };
  }

  // Paid path
  if (balanceCents >= MIN_BALANCE_CENTS) {
    console.log(`[billing] allow install=${installationId} reason=paid balance=${balanceCents}c`);
    return { status: 'allow', firstBlock: false };
  }

  // Blocked
  const firstBlock = !fields.blockedAt;
  console.log(`[billing] block install=${installationId} balance=${balanceCents}c firstBlock=${firstBlock}`);
  return { status: 'block', firstBlock };
}
