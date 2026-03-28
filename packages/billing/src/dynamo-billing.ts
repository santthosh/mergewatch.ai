/**
 * Low-level DynamoDB operations for billing fields on the #SETTINGS sentinel row
 * in the mergewatch-installations table.
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { BillingFields } from '@mergewatch/core';

const SETTINGS_SK = '#SETTINGS';

/** Read billing fields from the #SETTINGS sentinel row. */
export async function getBillingFields(
  client: DynamoDBDocumentClient,
  table: string,
  installationId: string,
): Promise<BillingFields> {
  const result = await client.send(new GetCommand({
    TableName: table,
    Key: { installationId, repoFullName: SETTINGS_SK },
    ProjectionExpression:
      'freeReviewsUsed, stripeCustomerId, balanceCents, billingPeriod, '
      + 'prCount, prTimestamps, totalBilledCents, autoReloadEnabled, '
      + 'autoReloadThresholdCents, autoReloadAmountCents, autoReloadInFlight, '
      + 'blockedAt, blockIssueNumber, blockIssueRepo',
  }));

  return (result.Item as BillingFields) ?? {};
}

/**
 * Atomically increment freeReviewsUsed.
 * Fails with ConditionalCheckFailedException if already >= limit.
 */
export async function incrementFreeReviewsUsed(
  client: DynamoDBDocumentClient,
  table: string,
  installationId: string,
  limit: number,
): Promise<void> {
  await client.send(new UpdateCommand({
    TableName: table,
    Key: { installationId, repoFullName: SETTINGS_SK },
    UpdateExpression: 'ADD freeReviewsUsed :one',
    ConditionExpression: '(attribute_not_exists(freeReviewsUsed) OR freeReviewsUsed < :limit)',
    ExpressionAttributeValues: {
      ':one': 1,
      ':limit': limit,
    },
  }));
}

/**
 * Atomically deduct from balanceCents.
 * Fails with ConditionalCheckFailedException if insufficient balance.
 */
export async function deductBalance(
  client: DynamoDBDocumentClient,
  table: string,
  installationId: string,
  amountCents: number,
): Promise<void> {
  await client.send(new UpdateCommand({
    TableName: table,
    Key: { installationId, repoFullName: SETTINGS_SK },
    UpdateExpression: 'SET balanceCents = balanceCents - :amount',
    ConditionExpression: 'attribute_exists(balanceCents) AND balanceCents >= :amount',
    ExpressionAttributeValues: {
      ':amount': amountCents,
    },
  }));
}

/** Generic update of billing fields on the #SETTINGS row. */
export async function updateBillingFields(
  client: DynamoDBDocumentClient,
  table: string,
  installationId: string,
  fields: Partial<BillingFields>,
): Promise<void> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const setExprs: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    const nameToken = `#${key}`;
    const valToken = `:${key}`;
    names[nameToken] = key;
    values[valToken] = value;
    setExprs.push(`${nameToken} = ${valToken}`);
  }

  await client.send(new UpdateCommand({
    TableName: table,
    Key: { installationId, repoFullName: SETTINGS_SK },
    UpdateExpression: `SET ${setExprs.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}
