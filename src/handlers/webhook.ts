/**
 * AWS Lambda handler for incoming GitHub webhook events.
 *
 * This is the entry point for all GitHub webhooks. It:
 *  1. Verifies the webhook signature to ensure the request is authentic.
 *  2. Parses the event type from the `X-GitHub-Event` header.
 *  3. Routes the event to the appropriate handler logic:
 *       - `pull_request` (opened / synchronize) → enqueue a review job
 *       - `issue_comment` (containing @mergewatch)  → enqueue a review job
 *       - `installation` (created)                  → persist installation to DynamoDB
 *  4. Returns 200 immediately — the actual review work is done by an async
 *     invocation of the ReviewAgent Lambda.
 *
 * The handler is intentionally thin: all review logic lives elsewhere.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { LambdaClient, InvokeCommand, InvocationType } from "@aws-sdk/client-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { findExistingBotComment } from "../github/client";
import { getInstallationOctokit } from "../github/client";
import type {
  PullRequestEvent,
  IssueCommentEvent,
  InstallationEvent,
  ReviewMode,
  ReviewJobPayload,
} from "../types/github";

// ---------------------------------------------------------------------------
// AWS clients (re-used across warm invocations)
// ---------------------------------------------------------------------------

const ssm = new SSMClient({});
const lambda = new LambdaClient({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ---------------------------------------------------------------------------
// Cached webhook secret
// ---------------------------------------------------------------------------

let cachedWebhookSecret: string | undefined;

/**
 * Load the GitHub webhook secret from SSM Parameter Store.
 * Cached after the first call so cold-start cost is paid only once.
 */
async function getWebhookSecret(): Promise<string> {
  if (cachedWebhookSecret) return cachedWebhookSecret;

  const response = await ssm.send(
    new GetParameterCommand({
      Name: process.env.GITHUB_WEBHOOK_SECRET_PARAM ?? "/mergewatch/prod/github-webhook-secret",
      WithDecryption: true,
    })
  );

  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error("Webhook secret not found in SSM");
  }

  cachedWebhookSecret = value;
  return value;
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the `X-Hub-Signature-256` header against the raw request body.
 *
 * GitHub signs every webhook delivery with HMAC-SHA256 using the shared secret.
 * We use `timingSafeEqual` to prevent timing side-channel attacks.
 *
 * @returns `true` if the signature is valid, `false` otherwise.
 */
function verifySignature(
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

  // Buffers must be the same length for timingSafeEqual.
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}

// ---------------------------------------------------------------------------
// Event routing helpers
// ---------------------------------------------------------------------------

/**
 * Determine the review mode from an `@mergewatch` mention in a comment body.
 *
 * Supported triggers:
 *  - `@mergewatch review`  → full review
 *  - `@mergewatch summary` → summary-only (shorter output)
 *  - `@mergewatch` (alone) → defaults to full review
 *  - `@mergewatch <anything else>` → conversational response
 */
function parseReviewMode(commentBody: string): ReviewMode | null {
  if (!/@mergewatch/i.test(commentBody)) return null;

  // Check for explicit commands: @mergewatch review, @mergewatch summary
  if (/@mergewatch\s+review\b/i.test(commentBody)) return "review";
  if (/@mergewatch\s+summary\b/i.test(commentBody)) return "summary";

  // Bare @mergewatch at end of string or followed only by whitespace → full review
  if (/@mergewatch\s*$/im.test(commentBody)) return "review";

  // @mergewatch followed by other text → conversational follow-up
  return "respond";
}

/**
 * Asynchronously invoke the ReviewAgent Lambda with the given payload.
 *
 * We use `InvocationType.Event` so the call returns immediately — the
 * current handler does not wait for the review to complete.
 */
async function enqueueReviewJob(payload: ReviewJobPayload): Promise<void> {
  const functionName =
    process.env.REVIEW_AGENT_FUNCTION_NAME ?? "mergewatch-review-agent";

  await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: InvocationType.Event, // fire-and-forget
      Payload: Buffer.from(JSON.stringify(payload)),
    })
  );
}

/**
 * Store or update installation records in DynamoDB.
 *
 * The installations table uses a composite key:
 *   PK: installationId (String) — GitHub App installation ID
 *   SK: repoFullName (String)   — e.g. "owner/repo"
 *
 * A single installation event may include multiple repositories, so we
 * write one DynamoDB item per repo. This matches the schema defined in
 * infra/template.yaml and the InstallationItem type in src/types/db.ts.
 */
async function storeInstallation(event: InstallationEvent): Promise<void> {
  const tableName =
    process.env.INSTALLATIONS_TABLE ?? "mergewatch-installations";

  // The event may include a list of repositories the app was installed on.
  // If not present (e.g. on "deleted" events), store a single record keyed
  // by the account login as a fallback.
  const repos = event.repositories ?? [];

  if (repos.length === 0) {
    // No repos list — store a single record with account-level info.
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

  // Write one item per repository.
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

/**
 * Handle a `pull_request` event.
 *
 * We only act on `opened` (brand-new PR) and `synchronize` (new commits pushed
 * to an existing PR). For `synchronize`, we look for an existing MergeWatch
 * comment so the review agent can *update* it in place.
 */
async function handlePullRequestEvent(
  event: PullRequestEvent
): Promise<void> {
  const { action, pull_request: pr, repository, installation } = event;

  // Only trigger on new PRs or new pushes to existing PRs.
  if (action !== "opened" && action !== "synchronize") return;

  const installationId = installation?.id;
  if (!installationId) {
    console.warn("pull_request event missing installation ID — skipping");
    return;
  }

  const owner = repository.owner.login;
  const repo = repository.name;
  const prNumber = pr.number;

  // For synchronize events, check if we already have a comment to update.
  let existingCommentId: number | undefined;
  if (action === "synchronize") {
    const octokit = await getInstallationOctokit(installationId);
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
  });

  console.log(
    `Enqueued review job: ${owner}/${repo}#${prNumber} (action=${action}, existingComment=${existingCommentId ?? "none"})`
  );
}

// ---------------------------------------------------------------------------
// Issue comment event handler
// ---------------------------------------------------------------------------

/**
 * Handle an `issue_comment` event.
 *
 * We only trigger when:
 *  1. The comment was just created (not edited or deleted).
 *  2. The issue is actually a pull request (has `pull_request` key).
 *  3. The comment body contains `@mergewatch`.
 */
async function handleIssueCommentEvent(
  event: IssueCommentEvent
): Promise<void> {
  // Only react to newly created comments.
  if (event.action !== "created") return;

  // Only care about comments on pull requests, not plain issues.
  if (!event.issue.pull_request) return;

  const mode = parseReviewMode(event.comment.body);
  if (!mode) return; // No @mergewatch mention.

  const installationId = event.installation?.id;
  if (!installationId) {
    console.warn("issue_comment event missing installation ID — skipping");
    return;
  }

  const owner = event.repository.owner.login;
  const repo = event.repository.name;
  const prNumber = event.issue.number;

  // Always look for an existing comment so we update instead of duplicate.
  const octokit = await getInstallationOctokit(installationId);
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

  // For conversational responses, include the user's comment
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

/**
 * Handle an `installation` event.
 *
 * On `created` we persist the installation so downstream services can look
 * it up. On `deleted` we still record it (with action=deleted) for auditing.
 */
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

/**
 * Main Lambda handler.
 *
 * Expects to be wired up behind API Gateway (REST or HTTP API) so the
 * incoming event is an {@link APIGatewayProxyEvent}.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  // ---- 1. Verify webhook signature ----------------------------------------
  const body = event.body ?? "";
  const secret = await getWebhookSecret();

  // Headers may be lowercased by API Gateway depending on protocol version.
  const signatureHeader =
    event.headers["X-Hub-Signature-256"] ??
    event.headers["x-hub-signature-256"];

  if (!verifySignature(secret, body, signatureHeader)) {
    console.error("Webhook signature verification failed");
    return { statusCode: 401, body: "Invalid signature" };
  }

  // ---- 2. Parse event type from header ------------------------------------
  const githubEvent =
    event.headers["X-GitHub-Event"] ?? event.headers["x-github-event"];

  if (!githubEvent) {
    return { statusCode: 400, body: "Missing X-GitHub-Event header" };
  }

  // ---- 3. Parse body ------------------------------------------------------
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  // ---- 4. Route to the appropriate handler --------------------------------
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
        // We receive many event types we don't handle (e.g. push, star).
        // Just acknowledge them silently.
        console.log(`Ignoring unhandled event type: ${githubEvent}`);
    }
  } catch (error) {
    // Log the full error for CloudWatch but return 200 to GitHub so it
    // doesn't mark our webhook as failing. Transient errors will be
    // retried by the review agent's own retry logic.
    console.error(`Error handling ${githubEvent} event:`, error);
  }

  // Always return 200 to GitHub — we don't want webhook deliveries marked
  // as failed. Any real work happens asynchronously in the ReviewAgent Lambda.
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}
