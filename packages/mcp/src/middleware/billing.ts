/**
 * Billing middleware for MCP review_diff calls.
 *
 * Uses the same billingCheck / recordReview gate as the webhook path, plus
 * a 30-minute session dedup layer (IMcpSessionStore) so repeated reviews of
 * the same PR are billed only for the positive cost delta.
 */

import { randomUUID } from 'node:crypto';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type Stripe from 'stripe';
import type { IMcpSessionStore, McpSessionRecord } from '@mergewatch/core';
import type { billingCheck, recordReview } from '@mergewatch/billing';
import { computeBillingDelta, computeSessionTtl, isSessionActive } from '../session-math.js';
import type { BillingDelta } from '../session-math.js';

export type BillingCheckFn = typeof billingCheck;
export type RecordReviewFn = typeof recordReview;

export class BillingBlockedError extends Error {
  constructor(public installationId: string, public firstBlock: boolean) {
    super(`Billing blocked for installation ${installationId}`);
    this.name = 'BillingBlockedError';
  }
}

/**
 * Run the standard billing gate and throw BillingBlockedError if the caller
 * is over free tier and out of balance. Returns silently on allow.
 */
export async function checkMcpBilling(
  installationId: string,
  billing: { check: BillingCheckFn },
  ddbClient: DynamoDBDocumentClient,
  installationsTable: string,
): Promise<void> {
  const result = await billing.check(ddbClient, installationsTable, installationId);
  if (result.status === 'block') {
    throw new BillingBlockedError(installationId, result.firstBlock);
  }
}

/** Generate a fresh MCP session id. */
export function mintSessionId(): string {
  return `mcp-${randomUUID()}`;
}

export interface SessionResolution {
  session: McpSessionRecord | null;
  sessionId: string;
  isNew: boolean;
}

/**
 * Load the caller's existing session (if it's still within TTL) or mint a
 * new session id. The returned `session` is null for new sessions — pass it
 * straight to computeBillingDelta.
 */
export async function resolveOrCreateSession(
  sessionStore: IMcpSessionStore,
  providedSessionId: string | undefined,
  now: number = Date.now(),
): Promise<SessionResolution> {
  if (!providedSessionId) {
    return { session: null, sessionId: mintSessionId(), isNew: true };
  }
  const existing = await sessionStore.get(providedSessionId);
  if (!existing) {
    return { session: null, sessionId: providedSessionId, isNew: true };
  }
  if (!isSessionActive(existing, now)) {
    // Window closed — start a fresh session but preserve the caller's id so
    // tooling that pins a sessionId still gets consistent results.
    return { session: null, sessionId: providedSessionId, isNew: true };
  }
  return { session: existing, sessionId: existing.sessionId, isNew: false };
}

export interface RecordMcpReviewInput {
  installationId: string;
  sessionId: string;
  firstBilledAt: string;
  delta: BillingDelta;
  costCents: number;
}

/**
 * Persist the updated session row and record billing usage with a
 * session-scoped Stripe idempotency key. recordReview is still called even
 * when billCents is 0 so free-tier review counts stay accurate.
 */
export async function recordMcpReview(
  sessionStore: IMcpSessionStore,
  billing: { record: RecordReviewFn },
  ddbClient: DynamoDBDocumentClient,
  installationsTable: string,
  input: RecordMcpReviewInput,
  stripe?: Stripe,
): Promise<void> {
  const record: McpSessionRecord = {
    sessionId: input.sessionId,
    installationId: input.installationId,
    firstBilledAt: input.firstBilledAt,
    maxBilledCents: input.delta.newMaxBilledCents,
    iteration: input.delta.newIteration,
    ttl: computeSessionTtl(input.firstBilledAt),
  };
  await sessionStore.upsert(record);

  const idempotencyKey = `mcp-${input.sessionId}-${input.delta.newIteration}`;
  const billedUsd = input.delta.billCents / 100;
  await billing.record(
    ddbClient,
    installationsTable,
    input.installationId,
    billedUsd,
    idempotencyKey,
    stripe,
  );
}
