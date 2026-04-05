/**
 * AWS Lambda handler for incoming GitHub webhook events.
 *
 * This is the entry point for all GitHub webhooks. It:
 *  1. Verifies the webhook signature to ensure the request is authentic.
 *  2. Parses the event type from the `X-GitHub-Event` header.
 *  3. Routes the event to the appropriate handler logic.
 *  4. Returns 200 immediately — the actual review work is done by an async
 *     invocation of the ReviewAgent Lambda.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { LambdaClient, InvokeCommand, InvocationType } from "@aws-sdk/client-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  findExistingBotComment,
  REVIEW_TRIGGERING_ACTIONS,
  COMMENT_LOOKUP_ACTIONS,
} from '@mergewatch/core';
import type {
  PullRequestEvent,
  IssueCommentEvent,
  InstallationEvent,
  ReviewMode,
  ReviewJobPayload,
} from '@mergewatch/core';
import { SSMGitHubAuthProvider, getWebhookSecret } from '../github-auth-ssm.js';

// ---------------------------------------------------------------------------
// AWS clients (re-used across warm invocations)
// ---------------------------------------------------------------------------

const lambda = new LambdaClient({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const authProvider = new SSMGitHubAuthProvider();

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the `X-Hub-Signature-256` header against the raw request body.
 */
export function verifySignature(
  secret: string,
  body: string,
  signatureHeader: string | undefined
): boolean {
  if (!signatureHeader) return false;

  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    "utf8"
  );
  const actual = Buffer.from(signatureHeader, "utf8");

  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}

// ---------------------------------------------------------------------------
// Event routing helpers
// ---------------------------------------------------------------------------

/**
 * Determine the review mode from an `@mergewatch` mention in a comment body.
 */
export function parseReviewMode(commentBody: string): ReviewMode | null {
  if (!/@mergewatch/i.test(commentBody)) return null;

  if (/@mergewatch\s+review\b/i.test(commentBody)) return "review";
  if (/@mergewatch\s+summary\b/i.test(commentBody)) return "summary";
  if (/@mergewatch\s*$/im.test(commentBody)) return "review";

  return "respond";
}

/**
 * Asynchronously invoke the ReviewAgent Lambda with the given payload.
 */
async function enqueueReviewJob(payload: ReviewJobPayload): Promise<void> {
  const functionName =
    process.env.REVIEW_AGENT_FUNCTION_NAME ?? "mergewatch-review-agent";

  await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: InvocationType.Event,
      Payload: Buffer.from(JSON.stringify(payload)),
    })
  );
}

/**
 * Store or update installation records in DynamoDB.
 */
async function storeInstallation(event: InstallationEvent): Promise<void> {
  const tableName =
    process.env.INSTALLATIONS_TABLE ?? "mergewatch-installations";

  const repos = event.repositories ?? [];

  if (repos.length === 0) {
    await dynamodb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          installationId: String(event.installation.id),
          repoFullName: event.installation.account.login,
          installedAt: event.installation.created_at,
          config: {},
        },
      })
    );
    return;
  }

  for (const repo of repos) {
    await dynamodb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          installationId: String(event.installation.id),
          repoFullName: repo.full_name,
          installedAt: event.installation.created_at,
          config: {},
        },
      })
    );
  }
}

// ---------------------------------------------------------------------------
// Pull request event handler
// ---------------------------------------------------------------------------

async function handlePullRequestEvent(
  event: PullRequestEvent
): Promise<void> {
  const { action, pull_request: pr, repository, installation } = event;

  if (!(REVIEW_TRIGGERING_ACTIONS as readonly string[]).includes(action)) return;

  const installationId = installation?.id;
  if (!installationId) {
    console.warn("pull_request event missing installation ID — skipping");
    return;
  }

  const owner = repository.owner.login;
  const repo = repository.name;
  const prNumber = pr.number;

  let existingCommentId: number | undefined;
  if ((COMMENT_LOOKUP_ACTIONS as readonly string[]).includes(action)) {
    const octokit = await authProvider.getInstallationOctokit(installationId);
    const commentId = await findExistingBotComment(octokit, owner, repo, prNumber);
    if (commentId) {
      existingCommentId = commentId;
    }
  }

  await enqueueReviewJob({
    installationId,
    owner,
    repo,
    prNumber,
    mode: "review",
    existingCommentId,
    isDraft: pr.draft ?? false,
    prLabels: pr.labels?.map((l) => l.name) ?? [],
    changedFileCount: pr.changed_files,
  });

  console.log(
    `Enqueued review job: ${owner}/${repo}#${prNumber} (action=${action}, existingComment=${existingCommentId ?? "none"})`
  );
}

// ---------------------------------------------------------------------------
// Issue comment event handler
// ---------------------------------------------------------------------------

async function handleIssueCommentEvent(
  event: IssueCommentEvent
): Promise<void> {
  if (event.action !== "created") return;
  if (!event.issue.pull_request) return;

  // Ignore comments from bots (prevents self-triggering loops)
  if (event.sender.type === "Bot") return;

  const mode = parseReviewMode(event.comment.body);
  if (!mode) return;

  const installationId = event.installation?.id;
  if (!installationId) {
    console.warn("issue_comment event missing installation ID — skipping");
    return;
  }

  const owner = event.repository.owner.login;
  const repo = event.repository.name;
  const prNumber = event.issue.number;

  const octokit = await authProvider.getInstallationOctokit(installationId);
  const existingCommentId =
    (await findExistingBotComment(octokit, owner, repo, prNumber)) ?? undefined;

  const payload: ReviewJobPayload = {
    installationId,
    owner,
    repo,
    prNumber,
    mode,
    existingCommentId,
  };

  if (mode === "respond") {
    payload.userComment = event.comment.body;
    payload.userCommentAuthor = event.sender.login;
  }

  await enqueueReviewJob(payload);

  console.log(
    `Enqueued ${mode} job from comment: ${owner}/${repo}#${prNumber} (existingComment=${existingCommentId ?? "none"})`
  );
}

// ---------------------------------------------------------------------------
// Installation event handler
// ---------------------------------------------------------------------------

async function handleInstallationEvent(
  event: InstallationEvent
): Promise<void> {
  await storeInstallation(event);
  console.log(
    `Installation ${event.action}: ${event.installation.account.login} (id=${event.installation.id})`
  );
}

// ---------------------------------------------------------------------------
// Lambda entry point
// ---------------------------------------------------------------------------

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const body = event.body ?? "";
  const secret = await getWebhookSecret();

  const signatureHeader =
    event.headers["X-Hub-Signature-256"] ??
    event.headers["x-hub-signature-256"];

  if (!verifySignature(secret, body, signatureHeader)) {
    console.error("Webhook signature verification failed");
    return { statusCode: 401, body: "Invalid signature" };
  }

  const githubEvent =
    event.headers["X-GitHub-Event"] ?? event.headers["x-github-event"];

  if (!githubEvent) {
    return { statusCode: 400, body: "Missing X-GitHub-Event header" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  try {
    switch (githubEvent) {
      case "pull_request":
        await handlePullRequestEvent(payload as PullRequestEvent);
        break;

      case "issue_comment":
        await handleIssueCommentEvent(payload as IssueCommentEvent);
        break;

      case "installation":
        await handleInstallationEvent(payload as InstallationEvent);
        break;

      default:
        console.log(`Ignoring unhandled event type: ${githubEvent}`);
    }
  } catch (error) {
    console.error(`Error handling ${githubEvent} event:`, error);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}
