/**
 * Dashboard-specific storage interfaces.
 *
 * These operations serve the Next.js dashboard and are separate from the
 * pipeline interfaces (IInstallationStore / IReviewStore) because they need
 * pagination, stats aggregation, bulk monitoring, and feedback — operations
 * that don't belong on the lean pipeline stores.
 *
 * Implementations:
 *   - DynamoDashboardStore  (packages/storage-dynamo)  — SaaS / Amplify
 *   - PostgresDashboardStore (packages/storage-postgres) — self-hosted / Docker
 */

import type { InstallationItem, InstallationSettings, ReviewItem } from '../types/db.js';

// ─── Paginated result wrapper ───────────────────────────────────────────────

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

// ─── Stats types ────────────────────────────────────────────────────────────

export interface ReviewStats {
  total: number;
  completed: number;
  findings: number;
}

export interface RepoStats {
  reviewCount: number;
  issueCount: number;
  lastReviewedAt: string | null;
}

// ─── Installation store (dashboard operations) ─────────────────────────────

export interface IDashboardInstallationStore {
  /** List all repos for a given GitHub App installation. */
  listByInstallation(installationId: string): Promise<InstallationItem[]>;

  /** Get installation-level settings (merged with defaults). */
  getSettings(installationId: string): Promise<InstallationSettings>;

  /** Save installation-level settings. */
  updateSettings(installationId: string, settings: InstallationSettings): Promise<void>;

  /** Toggle a single repo's monitored flag. */
  updateMonitored(installationId: string, repoFullName: string, monitored: boolean): Promise<void>;
}

// ─── Review store (dashboard operations) ────────────────────────────────────

export interface IDashboardReviewStore {
  /** List reviews across multiple repos with pagination and optional status/date filter. */
  listReviews(
    repos: string[],
    limit: number,
    cursor?: string,
    status?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<PaginatedResult<ReviewItem>>;

  /** Get a single review by composite key. */
  getReview(repoFullName: string, prNumberCommitSha: string): Promise<ReviewItem | null>;

  /** Set or clear feedback on a review. */
  updateFeedback(
    repoFullName: string,
    prNumberCommitSha: string,
    feedback: 'up' | 'down' | null,
  ): Promise<void>;

  /** Aggregate stats (total, completed, findings) across repos. */
  getReviewStats(repos: string[]): Promise<ReviewStats>;

  /** Per-repo stats (review count, issue count, last reviewed). */
  getRepoStats(repos: string[]): Promise<Map<string, RepoStats>>;
}

// ─── Combined dashboard store ───────────────────────────────────────────────

export interface IDashboardStore {
  installations: IDashboardInstallationStore;
  reviews: IDashboardReviewStore;
}
