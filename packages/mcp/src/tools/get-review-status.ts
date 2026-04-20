/**
 * get_review_status MCP tool — reads the latest ReviewItem for a PR.
 *
 * Pure read, no billing, auth-gated by the transport layer via AuthResolution.
 */

import type { ReviewItem } from '@mergewatch/core';
import type { AuthResolution } from '../middleware/auth.js';
import { isRepoInScope } from '../middleware/auth.js';
import type { McpServerDeps } from '../server-deps.js';
import { splitOwnerRepo } from './review-diff.js';

export interface GetReviewStatusInput {
  /** owner/repo. */
  repo: string;
  /** Pull request number. */
  prNumber: number;
}

export interface GetReviewStatusOutput {
  /** True when no review rows exist for this PR. */
  found: boolean;
  review?: ReviewItem;
}

export async function handleGetReviewStatus(
  input: GetReviewStatusInput,
  deps: McpServerDeps,
  authContext: AuthResolution,
): Promise<GetReviewStatusOutput> {
  const parsed = splitOwnerRepo(input.repo);
  if (!parsed) {
    throw new Error('get_review_status: "repo" must be in "owner/repo" format');
  }
  if (!Number.isFinite(input.prNumber) || input.prNumber <= 0) {
    throw new Error('get_review_status: "prNumber" must be a positive integer');
  }
  const repoFullName = `${parsed.owner}/${parsed.repo}`;
  if (!isRepoInScope(authContext, repoFullName)) {
    throw new Error(`get_review_status: API key scope does not grant access to ${repoFullName}`);
  }

  const rows = await deps.reviewStore.queryByPR(repoFullName, `${input.prNumber}#`, 1);
  if (!rows || rows.length === 0) {
    return { found: false };
  }
  return { found: true, review: rows[0] };
}
