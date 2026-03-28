import { INFRA_FEE, MARGIN_PERCENT } from './constants';

export interface ReviewCost {
  /** Raw LLM cost in USD (passthrough from estimatedCostUsd). */
  llmCost: number;
  /** Platform fee in USD (INFRA_FEE + margin on LLM cost). */
  platformFee: number;
  /** Total charge in USD (llmCost + platformFee). */
  total: number;
  /** Total charge in cents (integer, rounded up). */
  totalCents: number;
}

/**
 * Calculate the total cost of a review including the platform fee.
 *
 * Formula: total = llmCost + INFRA_FEE + (llmCost * MARGIN_PERCENT)
 *
 * @param estimatedCostUsd — raw LLM cost from the review pipeline
 */
export function calculateReviewCost(estimatedCostUsd: number): ReviewCost {
  const llmCost = Math.max(0, estimatedCostUsd);
  const platformFee = INFRA_FEE + llmCost * MARGIN_PERCENT;
  const total = llmCost + platformFee;
  const totalCents = Math.ceil(total * 100);

  return { llmCost, platformFee, total, totalCents };
}
