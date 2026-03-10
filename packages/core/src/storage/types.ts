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
  updateStatus(
    repoFullName: string,
    key: string,
    status: ReviewStatus,
    extra?: Partial<ReviewItem>,
  ): Promise<void>;
  queryByPR(repoFullName: string, prPrefix: string, limit?: number): Promise<ReviewItem[]>;
}
