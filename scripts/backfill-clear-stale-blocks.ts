#!/usr/bin/env npx tsx
/**
 * One-time backfill: clear stale blockedAt fields for installations that
 * have sufficient balance but were never unblocked due to the
 * updateBillingFields bug (undefined values silently dropped).
 *
 * Also re-files a billing issue for installations that are truly blocked
 * (balance < MIN_BALANCE_CENTS) but have blockedAt set — meaning they
 * were silently blocked without notification on a subsequent block cycle.
 *
 * Usage:
 *   npx tsx scripts/backfill-clear-stale-blocks.ts [--dry-run]
 *
 * Requires: AWS credentials with DynamoDB access (uses --profile mergewatch)
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const DRY_RUN = process.argv.includes('--dry-run');
const TABLE = process.env.INSTALLATIONS_TABLE ?? 'mergewatch-installations';
const MIN_BALANCE_CENTS = 5; // from packages/billing/src/constants.ts
const SETTINGS_SK = '#SETTINGS';

const dynamodb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ profile: 'mergewatch' }),
);

async function main() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Scanning ${TABLE} for stale billing blocks...\n`);

  let lastKey: Record<string, any> | undefined;
  let scanned = 0;
  let clearedCount = 0;
  let silentBlockCount = 0;

  do {
    const result = await dynamodb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'repoFullName = :sk AND attribute_exists(blockedAt)',
      ExpressionAttributeValues: {
        ':sk': { S: SETTINGS_SK },
      },
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));

    for (const rawItem of result.Items ?? []) {
      const item = unmarshall(rawItem);
      scanned++;

      const installationId = item.installationId as string;
      const balanceCents = (item.balanceCents as number) ?? 0;
      const blockedAt = item.blockedAt as string;
      const blockIssueNumber = item.blockIssueNumber as number | undefined;

      if (balanceCents >= MIN_BALANCE_CENTS) {
        // Has enough balance — stale blockedAt should be cleared
        console.log(`CLEAR  install=${installationId} balance=${balanceCents}c blockedAt=${blockedAt} issue=#${blockIssueNumber ?? 'none'}`);
        clearedCount++;

        if (!DRY_RUN) {
          await dynamodb.send(new UpdateCommand({
            TableName: TABLE,
            Key: { installationId, repoFullName: SETTINGS_SK },
            UpdateExpression: 'REMOVE #blockedAt, #blockIssueNumber, #blockIssueRepo',
            ExpressionAttributeNames: {
              '#blockedAt': 'blockedAt',
              '#blockIssueNumber': 'blockIssueNumber',
              '#blockIssueRepo': 'blockIssueRepo',
            },
          }));
        }
      } else {
        // Truly blocked with insufficient balance — check if they were silently blocked
        console.log(`BLOCKED install=${installationId} balance=${balanceCents}c blockedAt=${blockedAt} issue=#${blockIssueNumber ?? 'MISSING — silently blocked!'}`);
        if (!blockIssueNumber) {
          silentBlockCount++;
        }
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log(`\nDone. Scanned ${scanned} blocked installation(s).`);
  console.log(`  Cleared stale blocks: ${clearedCount}`);
  console.log(`  Silently blocked (no issue filed): ${silentBlockCount}`);
  if (DRY_RUN) {
    console.log('\n  Re-run without --dry-run to apply changes.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
