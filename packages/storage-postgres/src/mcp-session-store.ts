import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { IMcpSessionStore, McpSessionRecord } from '@mergewatch/core';
import { mcpSessions } from './schema.js';

export class PostgresMcpSessionStore implements IMcpSessionStore {
  constructor(private db: PostgresJsDatabase) {}

  async get(sessionId: string): Promise<McpSessionRecord | null> {
    const rows = await this.db
      .select()
      .from(mcpSessions)
      .where(eq(mcpSessions.sessionId, sessionId))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      sessionId: row.sessionId,
      installationId: row.installationId,
      firstBilledAt: row.firstBilledAt.toISOString(),
      maxBilledCents: row.maxBilledCents,
      iteration: row.iteration,
      ttl: Math.floor(row.expiresAt.getTime() / 1000),
    };
  }

  async upsert(record: McpSessionRecord): Promise<void> {
    const values = {
      sessionId: record.sessionId,
      installationId: record.installationId,
      firstBilledAt: new Date(record.firstBilledAt),
      maxBilledCents: record.maxBilledCents,
      iteration: record.iteration,
      expiresAt: new Date(record.ttl * 1000),
    };
    await this.db
      .insert(mcpSessions)
      .values(values)
      .onConflictDoUpdate({
        target: mcpSessions.sessionId,
        set: {
          installationId: values.installationId,
          firstBilledAt: values.firstBilledAt,
          maxBilledCents: values.maxBilledCents,
          iteration: values.iteration,
          expiresAt: values.expiresAt,
        },
      });
  }
}
