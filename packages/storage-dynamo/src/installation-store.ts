/**
 * DynamoDB implementation of IInstallationStore.
 *
 * Extracted from src/handlers/review-agent.ts — loadInstallationConfig
 * and loadInstallationSettings functions.
 */

import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { IInstallationStore } from '@mergewatch/core';
import type { InstallationItem, InstallationSettings } from '@mergewatch/core';
import { DEFAULT_INSTALLATION_SETTINGS as DEFAULTS } from '@mergewatch/core';

export class DynamoInstallationStore implements IInstallationStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async get(installationId: string, repoFullName: string): Promise<InstallationItem | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          installationId,
          repoFullName,
        },
      }),
    );

    return (result.Item as InstallationItem) ?? null;
  }

  async getSettings(installationId: string): Promise<InstallationSettings> {
    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            installationId,
            repoFullName: '#SETTINGS',
          },
        }),
      );

      const saved = (result.Item?.settings ?? {}) as Partial<InstallationSettings>;
      return {
        ...DEFAULTS,
        ...saved,
        commentTypes: { ...DEFAULTS.commentTypes, ...(saved.commentTypes ?? {}) },
        summary: { ...DEFAULTS.summary, ...(saved.summary ?? {}) },
      };
    } catch {
      return DEFAULTS;
    }
  }

  async upsert(item: InstallationItem): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      }),
    );
  }
}
