/**
 * Provider-agnostic storage interfaces.
 *
 * Implementations:
 *   - DynamoInstallationStore / DynamoReviewStore (packages/storage-dynamo)
 *   - Future: PostgresInstallationStore / PostgresReviewStore
 */

import type { InstallationItem, InstallationSettings, ReviewItem, ReviewStatus } from '../types/db.js';

export interface IInstallationStore {
  get(installationId: string, repoFullName: string): Promise<InstallationItem | null>;
  getSettings(installationId: string): Promise<InstallationSettings>;
  upsert(item: InstallationItem): Promise<void>;
}

export interface IReviewStore {
  upsert(review: ReviewItem): Promise<void>;
  /**
   * Atomically claim a review for processing.
   * Inserts the review record only if no record with the same key exists
   * or the existing record is not already in_progress/complete.
   * Returns true if this caller claimed the review, false if another worker already has it.
   */
  claimReview(review: ReviewItem): Promise<boolean>;
  updateStatus(
    repoFullName: string,
    key: string,
    status: ReviewStatus,
    extra?: Partial<ReviewItem>,
  ): Promise<void>;
  queryByPR(repoFullName: string, prPrefix: string, limit?: number): Promise<ReviewItem[]>;
}

export interface ApiKeyRecord {
  /** sha256 hex of the raw key. Raw key is never stored. */
  keyHash: string;
  /** GitHub App installation this key unlocks. */
  installationId: string;
  /** Human-friendly label for the dashboard. */
  label: string;
  /** Either 'all' (all repos in the installation) or a specific list of owner/repo strings. */
  scope: 'all' | string[];
  /** GitHub user ID of the dashboard user who created the key. */
  createdBy: string;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601, set on each MCP request. Optional on create. */
  lastUsedAt?: string;
}

export interface IApiKeyStore {
  create(record: Omit<ApiKeyRecord, 'lastUsedAt'>): Promise<void>;
  getByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  listByInstallation(installationId: string): Promise<ApiKeyRecord[]>;
  delete(keyHash: string): Promise<void>;
  touchLastUsed(keyHash: string, isoTimestamp: string): Promise<void>;
}

export interface McpSessionRecord {
  sessionId: string;
  installationId: string;
  /** ISO 8601 — used to derive ttl. */
  firstBilledAt: string;
  /** Highest cost billed so far in this session, in cents. */
  maxBilledCents: number;
  /** How many review_diff calls have been made in this session. */
  iteration: number;
  /** Unix epoch seconds for DynamoDB TTL. Postgres uses firstBilledAt + 30 min. */
  ttl: number;
}

export interface IMcpSessionStore {
  get(sessionId: string): Promise<McpSessionRecord | null>;
  upsert(record: McpSessionRecord): Promise<void>;
}
