/** Number of free reviews per installation (lifetime). */
export const FREE_REVIEW_LIMIT = 5;

/** Fixed infrastructure fee added to each review (USD). */
export const INFRA_FEE = 0.005;

/** Margin applied on top of LLM cost + infra fee (40%). */
export const MARGIN_PERCENT = 0.40;

/** Minimum balance in USD required to run a paid review. */
export const MIN_BALANCE_USD = 0.05;

/** Minimum balance in cents (derived from MIN_BALANCE_USD). */
export const MIN_BALANCE_CENTS = Math.round(MIN_BALANCE_USD * 100);
