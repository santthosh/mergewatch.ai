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
