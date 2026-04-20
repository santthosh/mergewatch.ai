/**
 * DynamoDB implementation of IApiKeyStore.
 *
 * Schema:
 *   PK: keyHash (String) — sha256 hex of the raw key
 *   GSI "ByInstallation": PK=installationId (projection=ALL)
 *
 * Table name: env API_KEYS_TABLE, fallback mergewatch-api-keys.
 */

import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { ApiKeyRecord, IApiKeyStore } from '@mergewatch/core';

export const DEFAULT_API_KEYS_TABLE = 'mergewatch-api-keys';
export const API_KEYS_INSTALLATION_INDEX = 'ByInstallation';

export class DynamoApiKeyStore implements IApiKeyStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string = process.env.API_KEYS_TABLE ?? DEFAULT_API_KEYS_TABLE,
  ) {}

  async create(record: Omit<ApiKeyRecord, 'lastUsedAt'>): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: record,
        ConditionExpression: 'attribute_not_exists(keyHash)',
      }),
    );
  }

  async getByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { keyHash },
      }),
    );
    return (result.Item as ApiKeyRecord) ?? null;
  }

  async listByInstallation(installationId: string): Promise<ApiKeyRecord[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: API_KEYS_INSTALLATION_INDEX,
        KeyConditionExpression: 'installationId = :iid',
        ExpressionAttributeValues: { ':iid': installationId },
      }),
    );
    return (result.Items ?? []) as ApiKeyRecord[];
  }

  async delete(keyHash: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { keyHash },
      }),
    );
  }

  async touchLastUsed(keyHash: string, isoTimestamp: string): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { keyHash },
        UpdateExpression: 'SET lastUsedAt = :ts',
        ExpressionAttributeValues: { ':ts': isoTimestamp },
      }),
    );
  }
}
