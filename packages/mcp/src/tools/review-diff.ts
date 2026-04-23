/**
 * review_diff MCP tool.
 *
 * Entry point for agent-driven pre-commit reviews. Accepts a raw unified diff
 * plus optional repo context, runs the full review pipeline with
 * agentAuthored=true, and bills the caller with a 30-minute session dedup.
 */

import type { Octokit } from '@octokit/rest';
import {
  DEFAULT_CONFIG,
  fetchConventions,
  fetchRepoConfig,
  mergeConfig,
  runReviewPipeline,
} from '@mergewatch/core';
import type {
  MergeWatchConfig,
  OrchestratedFinding,
  ReviewPipelineResult,
} from '@mergewatch/core';
import {
  checkMcpBilling,
  recordMcpReview,
  resolveOrCreateSession,
} from '../middleware/billing.js';
import type { AuthResolution } from '../middleware/auth.js';
import { isRepoInScope } from '../middleware/auth.js';
import { computeBillingDelta } from '../session-math.js';
import type { McpServerDeps } from '../server-deps.js';

export interface ReviewDiffInput {
  /** Raw unified diff to review. Required. */
  diff: string;
  /** Optional owner/repo string — enables conventions + config lookup. */
  repo?: string;
  /** Freeform task/PR description surfaced to agent prompts. */
  description?: string;
  /** Optional sessionId from a prior call; omit to start a fresh session. */
  sessionId?: string;
}

export interface ReviewDiffStats {
  filesAnalyzed: number;
  linesChanged: number;
  findingsBySeverity: { critical: number; warning: number; info: number };
  enabledAgentCount: number;
  suppressedCount: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
}

export interface ReviewDiffOutput {
  sessionId: string;
  iteration: number;
  mergeScore: number;
  mergeScoreReason: string;
  summary: string;
  findings: OrchestratedFinding[];
  stats: ReviewDiffStats;
}

/** Count the unique files appearing across the orchestrated findings. */
function countFiles(findings: OrchestratedFinding[]): number {
  const files = new Set<string>();
  for (const f of findings) {
    if (f.file) files.add(f.file);
  }
  return files.size;
}

/** Sum new-side line counts across a changedLines map. */
function countChangedLines(changedLines: Map<string, Set<number>>): number {
  let total = 0;
  for (const lines of changedLines.values()) total += lines.size;
  return total;
}

function bucketBySeverity(findings: OrchestratedFinding[]) {
  const bucket = { critical: 0, warning: 0, info: 0 };
  for (const f of findings) {
    if (f.severity === 'critical') bucket.critical += 1;
    else if (f.severity === 'warning') bucket.warning += 1;
    else if (f.severity === 'info') bucket.info += 1;
  }
  return bucket;
}

/** Split "owner/repo" into its two parts, returning null when the shape is wrong. */
export function splitOwnerRepo(value: string | undefined): { owner: string; repo: string } | null {
  if (!value) return null;
  const idx = value.indexOf('/');
  if (idx <= 0 || idx === value.length - 1) return null;
  return { owner: value.slice(0, idx), repo: value.slice(idx + 1) };
}

/**
 * Load repo config + conventions for a repo-scoped review_diff call. Missing
 * files return defaults — a repo without .mergewatch.yml still gets reviewed.
 */
export async function loadRepoContext(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<{ config: MergeWatchConfig; conventions?: string }> {
  const yaml = await fetchRepoConfig(octokit, owner, repo).catch(() => null);
  const config = mergeConfig(yaml ?? {});
  const conv = await fetchConventions(octokit, owner, repo, undefined, config.conventions).catch(
    () => null,
  );
  return { config, conventions: conv?.content };
}

/**
 * Shape a pipeline result into the MCP review_diff response.
 */
export function buildOutput(
  sessionId: string,
  iteration: number,
  result: ReviewPipelineResult,
  durationMs: number,
): ReviewDiffOutput {
  return {
    sessionId,
    iteration,
    mergeScore: result.mergeScore,
    mergeScoreReason: result.mergeScoreReason,
    summary: result.summary,
    findings: result.findings,
    stats: {
      filesAnalyzed: countFiles(result.findings),
      linesChanged: countChangedLines(result.changedLines),
      findingsBySeverity: bucketBySeverity(result.findings),
      enabledAgentCount: result.enabledAgentCount,
      suppressedCount: result.suppressedCount,
      durationMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: result.estimatedCostUsd,
    },
  };
}

/**
 * Validate + normalize the tool input. Throws on missing/empty diff.
 */
export function validateInput(input: ReviewDiffInput): ReviewDiffInput {
  if (!input || typeof input.diff !== 'string' || !input.diff.trim()) {
    throw new Error('review_diff: "diff" is required and must be non-empty');
  }
  return input;
}

/**
 * Main review_diff handler. Fires the pipeline with agentAuthored=true, then
 * bills the caller using session-scoped dedup.
 */
export async function handleReviewDiff(
  input: ReviewDiffInput,
  deps: McpServerDeps,
  authContext: AuthResolution,
): Promise<ReviewDiffOutput> {
  validateInput(input);

  // 1. Billing gate — throws BillingBlockedError on block.
  await checkMcpBilling(
    authContext.installationId,
    deps.billing,
    deps.ddbClient,
    deps.installationsTable,
  );

  // 2. Session resolution
  const { session, sessionId } = await resolveOrCreateSession(deps.sessionStore, input.sessionId);

  // 3. Optional repo context
  const parsedRepo = splitOwnerRepo(input.repo);
  let config: MergeWatchConfig = DEFAULT_CONFIG;
  let conventions: string | undefined;
  let owner = 'unknown';
  let repoName = 'unknown';
  if (parsedRepo) {
    if (!isRepoInScope(authContext, `${parsedRepo.owner}/${parsedRepo.repo}`)) {
      throw new Error(
        `review_diff: API key scope does not grant access to ${parsedRepo.owner}/${parsedRepo.repo}`,
      );
    }
    owner = parsedRepo.owner;
    repoName = parsedRepo.repo;
    try {
      const octokit = await deps.authProvider.getInstallationOctokit(
        Number(authContext.installationId),
      );
      const loaded = await loadRepoContext(octokit, owner, repoName);
      config = loaded.config;
      conventions = loaded.conventions;
    } catch (err) {
      console.warn('[mcp] failed to load repo context; using defaults:', err);
    }
  }

  // 4. Run pipeline with agentAuthored=true — this is an MCP agent call.
  const startedAt = Date.now();
  const result = await runReviewPipeline(
    {
      diff: input.diff,
      context: {
        owner,
        repo: repoName,
        prNumber: 0,
        prTitle: input.description,
        prBody: input.description,
      },
      modelId: config.model,
      lightModelId: config.lightModel,
      customStyleRules: config.customStyleRules,
      maxFindings: config.maxFindings,
      enabledAgents: config.agents,
      customAgents: config.customAgents,
      tone: config.ux.tone,
      customPricing: config.pricing,
      conventions,
      agentAuthored: true,
    },
    { llm: deps.llm },
  );
  const durationMs = Date.now() - startedAt;

  // 5. Compute + record billing
  const costCents = Math.round((result.estimatedCostUsd ?? 0) * 100);
  const delta = computeBillingDelta(session, costCents);
  const firstBilledAt = session?.firstBilledAt ?? new Date().toISOString();

  await recordMcpReview(
    deps.sessionStore,
    deps.billing,
    deps.ddbClient,
    deps.installationsTable,
    {
      installationId: authContext.installationId,
      sessionId,
      firstBilledAt,
      costCents,
      delta,
    },
    deps.stripe,
  );

  return buildOutput(sessionId, delta.newIteration, result, durationMs);
}
