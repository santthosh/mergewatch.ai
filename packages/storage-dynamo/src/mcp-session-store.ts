/**
 * DynamoDB implementation of IMcpSessionStore.
 *
 * Schema:
 *   PK: sessionId (String)
 *   TTL attribute: ttl (Unix epoch seconds)
 *
 * Table name: env SESSIONS_TABLE, fallback mergewatch-sessions.
 */

import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { IMcpSessionStore, McpSessionRecord } from '@mergewatch/core';

export const DEFAULT_SESSIONS_TABLE = 'mergewatch-sessions';

export class DynamoMcpSessionStore implements IMcpSessionStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string = process.env.SESSIONS_TABLE ?? DEFAULT_SESSIONS_TABLE,
  ) {}

  async get(sessionId: string): Promise<McpSessionRecord | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { sessionId },
      }),
    );
    return (result.Item as McpSessionRecord) ?? null;
  }

  async upsert(record: McpSessionRecord): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: record,
      }),
    );
  }
}
