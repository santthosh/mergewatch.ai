/**
 * Notifications posted when an installation is blocked due to insufficient credits.
 *
 * - Check Run with conclusion: action_required
 * - GitHub Issue filed once (atomic via conditional write on blockIssueNumber)
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createCheckRun } from '@mergewatch/core';
import { updateBillingFields } from './dynamo-billing';

const SETTINGS_SK = '#SETTINGS';

type Octokit = Parameters<typeof createCheckRun>[0];

/** Post a Check Run indicating the review was blocked by billing. */
export async function postBlockedCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
): Promise<void> {
  await createCheckRun(octokit, owner, repo, sha, {
    status: 'completed',
    conclusion: 'action_required',
    title: 'Review blocked — credits required',
    summary:
      'This PR was not reviewed because this installation has no remaining credits. '
      + 'Please add credits at https://mergewatch.ai/dashboard/billing to resume reviews.',
  });
}

/**
 * Create a GitHub Issue notifying the installation owner that reviews are blocked.
 * Uses a DynamoDB conditional write to ensure only one issue is created.
 */
export async function ensureBillingIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  installationId: string,
  client: DynamoDBDocumentClient,
  table: string,
): Promise<void> {
  // Atomically claim the right to create the issue
  try {
    await client.send(new UpdateCommand({
      TableName: table,
      Key: { installationId, repoFullName: SETTINGS_SK },
      UpdateExpression: 'SET blockedAt = :now, blockIssueRepo = :repo',
      ConditionExpression: 'attribute_not_exists(blockIssueNumber)',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString(),
        ':repo': `${owner}/${repo}`,
      },
    }));
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      // Issue already filed — nothing to do
      return;
    }
    throw err;
  }

  // Create the GitHub Issue
  const issue = await octokit.issues.create({
    owner,
    repo,
    title: 'MergeWatch: reviews paused — credits required',
    body:
      'MergeWatch has paused PR reviews for this repository because the installation '
      + 'has used all free reviews and has no remaining credits.\n\n'
      + 'To resume reviews, please add credits at '
      + '[mergewatch.ai/dashboard/billing](https://mergewatch.ai/dashboard/billing).\n\n'
      + 'This issue will be closed automatically once credits are added.',
    labels: ['mergewatch'],
  });

  // Store the issue number so we can close it later
  await updateBillingFields(client, table, installationId, {
    blockIssueNumber: issue.data.number,
    blockIssueRepo: `${owner}/${repo}`,
  });
}

/** Close a previously opened billing issue and clear the tracking fields. */
export async function closeBillingIssue(
  octokit: Octokit,
  installationId: string,
  client: DynamoDBDocumentClient,
  table: string,
  issueNumber: number,
  issueRepo: string,
): Promise<void> {
  const [owner, repo] = issueRepo.split('/');

  try {
    await octokit.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      state: 'closed',
      state_reason: 'completed',
    });

    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: 'Credits have been added. MergeWatch reviews are now active again.',
    });
  } catch (err) {
    console.warn('Failed to close billing issue:', err);
  }

  // Clear billing block fields
  await updateBillingFields(client, table, installationId, {
    blockedAt: undefined,
    blockIssueNumber: undefined,
    blockIssueRepo: undefined,
  });
}
