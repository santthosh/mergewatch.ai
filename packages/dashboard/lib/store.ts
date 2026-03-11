/**
 * Dashboard store factory.
 *
 * Returns an IDashboardStore backed by DynamoDB (SaaS) or Postgres (self-hosted)
 * based on the DEPLOYMENT_MODE env var. The unused storage package is never loaded
 * thanks to dynamic import().
 */

import type { IDashboardStore } from '@mergewatch/core';

let _store: IDashboardStore | null = null;

export async function getDashboardStore(): Promise<IDashboardStore> {
  if (_store) return _store;

  const mode = process.env.DEPLOYMENT_MODE ?? 'saas';

  if (mode === 'self-hosted') {
    const { createPostgresDashboardStore } = await import('@mergewatch/storage-postgres');
    _store = createPostgresDashboardStore(process.env.DATABASE_URL!);
  } else {
    const { createDynamoDashboardStore } = await import('@mergewatch/storage-dynamo');
    _store = createDynamoDashboardStore({
      installationsTable: process.env.DYNAMODB_TABLE_INSTALLATIONS ?? 'mergewatch-installations',
      reviewsTable: process.env.DYNAMODB_TABLE_REVIEWS ?? 'mergewatch-reviews',
      region: process.env.APP_REGION ?? process.env.AWS_REGION,
    });
  }

  return _store;
}
