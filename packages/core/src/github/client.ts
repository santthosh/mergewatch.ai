/**
 * GitHub API client for MergeWatch.
 *
 * This module handles:
 *  1. Fetching PR diffs and metadata.
 *  2. Creating, updating, and finding MergeWatch review comments.
 *
 * Authentication is handled externally via IGitHubAuthProvider — this module
 * only contains portable Octokit operations that work with any auth strategy.
 */

import { Octokit } from "@octokit/rest";
import yaml from 'js-yaml';
import type { PRContext } from "../types/github.js";
import type { MergeWatchConfig, CustomAgentDef, UXConfig } from '../config/defaults.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * HTML comment injected at the top of every MergeWatch review comment.
 * Used as a stable marker to locate an existing bot comment on a PR.
 */
export const BOT_COMMENT_MARKER = "<!-- mergewatch-review -->";

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

  const files = filesResponse.data;
  return {
    owner,
    repo,
    prNumber,
    title: pr.data.title,
    description: pr.data.body,
    baseBranch: pr.data.base.ref,
    headBranch: pr.data.head.ref,
    files: files.map((f) => f.filename),
    totalAdditions: files.reduce((sum, f) => sum + (f.additions ?? 0), 0),
    totalDeletions: files.reduce((sum, f) => sum + (f.deletions ?? 0), 0),
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
// Check runs (status checks)
// ---------------------------------------------------------------------------

/**
 * Create or update a GitHub Check Run on a specific commit.
 *
 * Used to show pass/fail status directly in the PR merge box.
 * Call once with status "in_progress" when the review starts,
 * then again with status "completed" + conclusion when done.
 */
export async function createCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  headSha: string,
  params: {
    status: 'queued' | 'in_progress' | 'completed';
    conclusion?: 'success' | 'failure' | 'neutral';
    title: string;
    summary: string;
    detailsUrl?: string;
  },
): Promise<void> {
  try {
    await octokit.checks.create({
      owner,
      repo,
      head_sha: headSha,
      name: 'MergeWatch Review',
      status: params.status,
      ...(params.conclusion && { conclusion: params.conclusion }),
      ...(params.detailsUrl && { details_url: params.detailsUrl }),
      output: {
        title: params.title,
        summary: params.summary,
      },
    });
  } catch (err) {
    // Non-critical — don't fail the review if the check run fails.
    console.warn(`Failed to create check run for ${owner}/${repo}@${headSha}:`, err);
  }
}

// ---------------------------------------------------------------------------
// PR Reviews API
// ---------------------------------------------------------------------------

/**
 * Map a merge readiness score (1–5) to a GitHub review event type.
 *
 *  1-2 → REQUEST_CHANGES (critical issues)
 *  3   → COMMENT (feedback without blocking)
 *  4-5 → APPROVE (looks good)
 */
export function mergeScoreToReviewEvent(
  mergeScore: number,
): 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' {
  if (mergeScore >= 4) return 'APPROVE';
  if (mergeScore <= 2) return 'REQUEST_CHANGES';
  return 'COMMENT';
}

/**
 * Submit a formal PR review using the Pull Request Reviews API.
 *
 * This makes MergeWatch appear as a proper reviewer in GitHub's
 * "Reviewers" section, similar to how Greptile/CodeRabbit appear.
 */
export async function submitPRReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
): Promise<void> {
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    body,
    event,
  });
}

/**
 * Dismiss any existing bot reviews on a PR so they don't conflict
 * with a new review on a later commit.
 *
 * Called on `synchronize` events before submitting a fresh review.
 */
export async function dismissStaleReviews(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  const reviews = await octokit.pulls.listReviews({
    owner,
    repo,
    pull_number: prNumber,
  });

  for (const review of reviews.data) {
    if (review.user?.type === 'Bot' && review.state !== 'DISMISSED') {
      await octokit.pulls.dismissReview({
        owner,
        repo,
        pull_number: prNumber,
        review_id: review.id,
        message: 'Superseded by new review on latest commit.',
      }).catch(() => {});
    }
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

// ---------------------------------------------------------------------------
// Repository config (.mergewatch.yml)
// ---------------------------------------------------------------------------

/**
 * Fetch and parse .mergewatch.yml from a repository's default branch.
 * Returns null if the file doesn't exist.
 */
export async function fetchRepoConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<Partial<MergeWatchConfig> | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: '.mergewatch.yml',
    });

    if (Array.isArray(data) || data.type !== 'file' || !data.content) {
      return null;
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const parsed = yaml.load(content) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    // Map YAML fields to MergeWatchConfig fields
    const config: Partial<MergeWatchConfig> = {};

    if (typeof parsed.model === 'string') config.model = parsed.model;
    if (typeof parsed.lightModel === 'string') config.lightModel = parsed.lightModel;
    if (typeof parsed.maxTokensPerAgent === 'number') config.maxTokensPerAgent = parsed.maxTokensPerAgent;
    if (typeof parsed.minSeverity === 'string' && ['info', 'warning', 'critical'].includes(parsed.minSeverity)) {
      config.minSeverity = parsed.minSeverity as 'info' | 'warning' | 'critical';
    }
    if (typeof parsed.maxFindings === 'number') config.maxFindings = parsed.maxFindings;
    if (typeof parsed.postSummaryOnClean === 'boolean') config.postSummaryOnClean = parsed.postSummaryOnClean;
    if (Array.isArray(parsed.customStyleRules)) {
      config.customStyleRules = parsed.customStyleRules.filter((r: unknown) => typeof r === 'string');
    }
    if (Array.isArray(parsed.excludePatterns)) {
      config.excludePatterns = parsed.excludePatterns.filter((p: unknown) => typeof p === 'string');
    }
    if (parsed.agents && typeof parsed.agents === 'object') {
      const a = parsed.agents as Record<string, unknown>;
      config.agents = {
        security: typeof a.security === 'boolean' ? a.security : true,
        bugs: typeof a.bugs === 'boolean' ? a.bugs : true,
        style: typeof a.style === 'boolean' ? a.style : true,
        summary: typeof a.summary === 'boolean' ? a.summary : true,
        diagram: typeof a.diagram === 'boolean' ? a.diagram : true,
        errorHandling: typeof a.errorHandling === 'boolean' ? a.errorHandling : true,
        testCoverage: typeof a.testCoverage === 'boolean' ? a.testCoverage : true,
        commentAccuracy: typeof a.commentAccuracy === 'boolean' ? a.commentAccuracy : true,
      };
    }

    // Codebase awareness fields
    if (typeof parsed.codebaseAwareness === 'boolean') config.codebaseAwareness = parsed.codebaseAwareness;
    if (typeof parsed.maxFileRequestRounds === 'number') config.maxFileRequestRounds = parsed.maxFileRequestRounds;
    if (typeof parsed.maxContextKB === 'number') config.maxContextKB = parsed.maxContextKB;

    // Custom agents
    if (Array.isArray(parsed.customAgents)) {
      const validSeverities = new Set(['info', 'warning', 'critical']);
      config.customAgents = (parsed.customAgents as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
        .filter((a) => typeof a.name === 'string' && typeof a.prompt === 'string')
        .map((a): CustomAgentDef => ({
          name: a.name as string,
          prompt: a.prompt as string,
          severityDefault: validSeverities.has(a.severityDefault as string)
            ? (a.severityDefault as 'info' | 'warning' | 'critical')
            : 'warning',
          enabled: typeof a.enabled === 'boolean' ? a.enabled : true,
        }));
    }

    // UX config
    if (parsed.ux && typeof parsed.ux === 'object') {
      const u = parsed.ux as Record<string, unknown>;
      const ux: Partial<UXConfig> = {};
      const validTones = new Set(['collaborative', 'direct', 'advisory']);
      if (typeof u.tone === 'string' && validTones.has(u.tone)) {
        ux.tone = u.tone as UXConfig['tone'];
      }
      if (typeof u.showWorkDone === 'boolean') ux.showWorkDone = u.showWorkDone;
      if (typeof u.showSuppressedCount === 'boolean') ux.showSuppressedCount = u.showSuppressedCount;
      if (typeof u.reviewerChecklist === 'boolean') ux.reviewerChecklist = u.reviewerChecklist;
      if (typeof u.allClearMessage === 'boolean') ux.allClearMessage = u.allClearMessage;
      if (typeof u.commentHeader === 'string') ux.commentHeader = u.commentHeader;
      config.ux = ux as UXConfig;
    }

    return config;
  } catch (err: unknown) {
    // 404 means no config file — that's fine
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      return null;
    }
    console.warn(`Failed to fetch .mergewatch.yml from ${owner}/${repo}:`, err);
    return null;
  }
}
