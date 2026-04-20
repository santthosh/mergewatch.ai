/**
 * Pure billing math for MCP sessions.
 *
 * Sessions deduplicate review_diff costs within a 30-minute window: later
 * iterations are only billed the positive delta above the highest-so-far
 * cost, so repeated runs on the same PR don't compound charges.
 */

import type { McpSessionRecord } from '@mergewatch/core';

export interface BillingDelta {
  /** Cents to bill for this call (0 = already covered by session max). */
  billCents: number;
  /** Updated maxBilledCents to persist. */
  newMaxBilledCents: number;
  /** 1-based iteration counter after this call. */
  newIteration: number;
}

/** 30 minutes in seconds. */
export const SESSION_TTL_SECONDS = 30 * 60;

/**
 * Compute the billing delta for an MCP review_diff call.
 *   - No session: bill the full cost, start at iteration 1.
 *   - Existing session: bill only max(0, callCost - maxBilledCents), raise
 *     the maxBilledCents floor if the new call cost more, bump iteration.
 */
export function computeBillingDelta(
  session: McpSessionRecord | null,
  callCostCents: number,
): BillingDelta {
  if (!session) {
    return {
      billCents: callCostCents,
      newMaxBilledCents: callCostCents,
      newIteration: 1,
    };
  }
  const delta = Math.max(0, callCostCents - session.maxBilledCents);
  return {
    billCents: delta,
    newMaxBilledCents: Math.max(callCostCents, session.maxBilledCents),
    newIteration: session.iteration + 1,
  };
}

/** TTL (unix epoch seconds) for a session first billed at the given ISO timestamp. */
export function computeSessionTtl(firstBilledAt: string): number {
  return Math.floor(new Date(firstBilledAt).getTime() / 1000) + SESSION_TTL_SECONDS;
}

/**
 * Whether an existing session is still within its 30-minute window.
 * Sessions past their ttl are treated as absent (new session is minted).
 */
export function isSessionActive(session: McpSessionRecord, nowMs: number = Date.now()): boolean {
  return session.ttl * 1000 > nowMs;
}
