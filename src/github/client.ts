/**
 * GitHub API client for MergeWatch.
 *
 * This module handles:
 *  1. Authenticating as the MergeWatch GitHub App (JWT → installation token).
 *  2. Fetching PR diffs and metadata.
 *  3. Creating, updating, and finding MergeWatch review comments.
 *
 * Authentication credentials (App ID, private key) are loaded from AWS SSM
 * Parameter Store at cold-start time and cached for the lifetime of the Lambda.
 */

import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import type { PRContext } from "../types/github";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * HTML comment injected at the top of every MergeWatch review comment.
 * Used as a stable marker to locate an existing bot comment on a PR.
 */
export const BOT_COMMENT_MARKER = "<!-- mergewatch-review -->";

// ---------------------------------------------------------------------------
// SSM helpers — load secrets once per cold start
// ---------------------------------------------------------------------------

const ssm = new SSMClient({});

/** Simple in-memory cache so we only call SSM once per Lambda container. */
const ssmCache: Record<string, string> = {};

/**
 * Fetch a parameter from SSM Parameter Store (with decryption).
 * Results are cached for the lifetime of the process.
 */
async function getSSMParameter(name: string): Promise<string> {
  if (ssmCache[name]) {
    return ssmCache[name];
  }

  const response = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: true })
  );

  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter "${name}" not found or empty`);
  }

  ssmCache[name] = value;
  return value;
}

// ---------------------------------------------------------------------------
// App-level authentication
// ---------------------------------------------------------------------------

/**
 * Return an Octokit instance authenticated as a specific *installation*
 * of the MergeWatch GitHub App.
 *
 * Under the hood this:
 *  1. Reads the App ID and PEM private key from SSM.
 *  2. Creates a JWT signed with the private key.
 *  3. Exchanges the JWT for a short-lived installation access token.
 *
 * The `@octokit/auth-app` library handles JWT creation and token refresh
 * transparently — we just need to supply the credentials.
 *
 * @param installationId - The numeric ID of the GitHub App installation.
 * @returns An authenticated Octokit client scoped to that installation.
 */
export async function getInstallationOctokit(
  installationId: number
): Promise<Octokit> {
  const [appId, privateKey] = await Promise.all([
    getSSMParameter(process.env.GITHUB_APP_ID_PARAM ?? "/mergewatch/prod/github-app-id"),
    getSSMParameter(
      process.env.GITHUB_PRIVATE_KEY_PARAM ?? "/mergewatch/prod/github-private-key"
    ),
  ]);

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: Number(appId),
      privateKey,
      installationId,
    },
  });
}

// ---------------------------------------------------------------------------
// PR data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch the unified diff for a pull request.
 *
 * We request the diff via the GitHub API using the `application/vnd.github.v3.diff`
 * media type, which returns a plain-text unified diff — the same format you
 * would get from `git diff`.
 *
 * @returns The full diff as a string.
 */
export async function getPRDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const { data } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });

  // When the diff media type is requested, `data` comes back as a raw string
  // even though the TypeScript type says otherwise.
  return data as unknown as string;
}

/**
 * Fetch high-level context about a pull request: title, description,
 * base/head branches, and the list of changed file paths.
 *
 * This is used by the review agent to understand *what* the PR is about
 * before it dives into the diff.
 */
export async function getPRContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRContext> {
  // Fetch the PR metadata and the list of changed files in parallel.
  const [pr, filesResponse] = await Promise.all([
    octokit.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 300 }),
  ]);

  return {
    owner,
    repo,
    prNumber,
    title: pr.data.title,
    description: pr.data.body,
    baseBranch: pr.data.base.ref,
    headBranch: pr.data.head.ref,
    files: filesResponse.data.map((f) => f.filename),
  };
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

/**
 * Add a reaction to a PR (which is an issue in GitHub's API).
 * Used to signal review start (eyes) and completion (thumbs up).
 */
export async function addPRReaction(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  reaction: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes',
): Promise<void> {
  try {
    await octokit.reactions.createForIssue({
      owner,
      repo,
      issue_number: prNumber,
      content: reaction,
    });
  } catch (err) {
    // Non-critical — don't fail the review if reaction fails
    console.warn(`Failed to add ${reaction} reaction to ${owner}/${repo}#${prNumber}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Comment management
// ---------------------------------------------------------------------------

/**
 * Post a new review comment on a pull request.
 *
 * The comment body is always prefixed with {@link BOT_COMMENT_MARKER} so
 * we can locate it later via {@link findExistingBotComment}.
 *
 * @returns The numeric ID of the newly created comment.
 */
export async function postReviewComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<number> {
  const markedBody = `${BOT_COMMENT_MARKER}\n${body}`;

  const { data } = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: markedBody,
  });

  return data.id;
}

/**
 * Update an existing review comment in-place.
 *
 * This is called when a `synchronize` event fires on a PR that already has
 * a MergeWatch comment — we edit the comment rather than posting a new one
 * to keep the PR timeline clean.
 *
 * @param commentId - The numeric ID of the comment to update.
 * @param body      - The new body (the marker is prepended automatically).
 */
export async function updateReviewComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number,
  body: string
): Promise<void> {
  const markedBody = `${BOT_COMMENT_MARKER}\n${body}`;

  await octokit.issues.updateComment({
    owner,
    repo,
    comment_id: commentId,
    body: markedBody,
  });
}

/**
 * Search for an existing MergeWatch review comment on a pull request.
 *
 * We paginate through all issue comments and look for our
 * {@link BOT_COMMENT_MARKER} HTML comment in the body. Returns the comment
 * ID if found, or `null` if MergeWatch hasn't commented yet.
 */
export async function findExistingBotComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<number | null> {
  // Paginate through all comments on the PR. For most PRs this is a single
  // page, but we handle pagination just in case.
  const iterator = octokit.paginate.iterator(octokit.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  for await (const { data: comments } of iterator) {
    for (const comment of comments) {
      if (comment.body?.includes(BOT_COMMENT_MARKER)) {
        return comment.id;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Reactions on comments
// ---------------------------------------------------------------------------

/**
 * Fetch reaction counts on a specific comment.
 * Returns a map of reaction type → count.
 */
export async function getCommentReactions(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number,
): Promise<Record<string, number>> {
  try {
    const { data: comment } = await octokit.issues.getComment({
      owner,
      repo,
      comment_id: commentId,
    });

    const reactions = comment.reactions;
    if (!reactions) return {};

    const counts: Record<string, number> = {};
    const keys = ['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'] as const;
    for (const key of keys) {
      const val = (reactions as Record<string, unknown>)[key];
      if (typeof val === 'number' && val > 0) {
        counts[key] = val;
      }
    }
    return counts;
  } catch (err) {
    console.warn(`Failed to fetch reactions for comment ${commentId}:`, err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Reply comments (for conversational responses)
// ---------------------------------------------------------------------------

/**
 * Post a reply comment on a PR (without the bot marker).
 * Used for conversational follow-up responses, not review comments.
 */
export async function postReplyComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<number> {
  const { data } = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
  return data.id;
}
