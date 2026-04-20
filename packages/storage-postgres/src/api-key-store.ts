import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { ApiKeyRecord, IApiKeyStore } from '@mergewatch/core';
import { apiKeys } from './schema.js';

export class PostgresApiKeyStore implements IApiKeyStore {
  constructor(private db: PostgresJsDatabase) {}

  async create(record: Omit<ApiKeyRecord, 'lastUsedAt'>): Promise<void> {
    await this.db.insert(apiKeys).values({
      keyHash: record.keyHash,
      installationId: record.installationId,
      label: record.label,
      scope: record.scope as any,
      createdBy: record.createdBy,
      createdAt: new Date(record.createdAt),
    });
  }

  async getByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);
    if (rows.length === 0) return null;
    return toRecord(rows[0]);
  }

  async listByInstallation(installationId: string): Promise<ApiKeyRecord[]> {
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.installationId, installationId));
    return rows.map(toRecord);
  }

  async delete(keyHash: string): Promise<void> {
    await this.db.delete(apiKeys).where(eq(apiKeys.keyHash, keyHash));
  }

  async touchLastUsed(keyHash: string, isoTimestamp: string): Promise<void> {
    await this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date(isoTimestamp) })
      .where(eq(apiKeys.keyHash, keyHash));
  }
}

function toRecord(row: typeof apiKeys.$inferSelect): ApiKeyRecord {
  return {
    keyHash: row.keyHash,
    installationId: row.installationId,
    label: row.label,
    scope: row.scope as ApiKeyRecord['scope'],
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
  };
}
