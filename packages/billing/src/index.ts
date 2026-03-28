// ─── Deployment mode ────────────────────────────────────────────────────────
export { getDeploymentMode, isSaas, isSelfHosted } from './deployment';
export type { DeploymentMode } from './deployment';

// ─── Constants ──────────────────────────────────────────────────────────────
export {
  FREE_REVIEW_LIMIT,
  INFRA_FEE,
  MARGIN_PERCENT,
  MIN_BALANCE_USD,
  MIN_BALANCE_CENTS,
} from './constants';

// ─── Cost calculation ───────────────────────────────────────────────────────
export { calculateReviewCost } from './cost';
export type { ReviewCost } from './cost';

// ─── Billing check ──────────────────────────────────────────────────────────
export { billingCheck } from './billing-check';
export type { BillingCheckResult } from './billing-check';

// ─── Record review ──────────────────────────────────────────────────────────
export { recordReview } from './record-review';

// ─── DynamoDB billing ops ───────────────────────────────────────────────────
export {
  getBillingFields,
  incrementFreeReviewsUsed,
  deductBalance,
  updateBillingFields,
} from './dynamo-billing';

// ─── Block notifications ────────────────────────────────────────────────────
export { postBlockedCheckRun, ensureBillingIssue, closeBillingIssue } from './block-notify';
