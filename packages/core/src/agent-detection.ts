/**
 * PR-source classification: agent-authored vs human-authored.
 *
 * Called on the webhook path before enqueuing a review job so that downstream
 * runtimes (Lambda review-agent, Express review-processor) know whether to
 * inject the agent-mode prompt suffix and persist `source` / `agentKind` on
 * the ReviewItem.
 *
 * Detection is best-effort — if the Octokit call for commit trailers fails
 * we fall back to 'human' rather than failing the whole webhook delivery.
 *
 * Rule ordering (label > branch > trailer) is important: labels are the
 * cheapest and most explicit signal, branch prefixes are zero-API, and commit
 * trailers require a paged API call so they run last.
 */
import type { Octokit } from '@octokit/rest';
import type { GitHubPullRequest } from './types/github.js';
import type { AgentReviewConfig } from './config/defaults.js';

export type AgentKind = 'claude' | 'cursor' | 'codex' | 'other';

export interface ClassificationResult {
  source: 'agent' | 'human';
  agentKind?: AgentKind;
  /** Which rule matched (for logging / debugging). */
  matchedRule?: 'trailer' | 'branch' | 'label';
}

/**
 * Map a matched string (label name, branch prefix, or trailer fragment) to an
 * AgentKind via lowercase substring match. Falls back to 'other' so we always
 * tag the review with *something* when a detection rule fires.
 */
function kindFromString(value: string): AgentKind {
  const lower = value.toLowerCase();
  if (lower.includes('claude')) return 'claude';
  if (lower.includes('cursor')) return 'cursor';
  if (lower.includes('codex')) return 'codex';
  return 'other';
}

function kindFromLabel(label: string): AgentKind {
  return kindFromString(label);
}

function kindFromBranch(prefix: string): AgentKind {
  return kindFromString(prefix);
}

function kindFromTrailer(trailer: string): AgentKind {
  return kindFromString(trailer);
}

/**
 * Classify a PR as agent- or human-authored using the configured detection
 * heuristics. Returns 'human' when detection is disabled or no rule matches.
 */
export async function classifyPrSource(
  pr: GitHubPullRequest,
  octokit: Octokit,
  config: AgentReviewConfig | undefined,
): Promise<ClassificationResult> {
  if (!config || !config.enabled) return { source: 'human' };

  // 1. Label check — cheapest signal, no API call.
  const labelNames = (pr.labels ?? []).map((l) => l.name.toLowerCase());
  for (const match of config.detection.labels) {
    if (labelNames.includes(match.toLowerCase())) {
      return { source: 'agent', agentKind: kindFromLabel(match), matchedRule: 'label' };
    }
  }

  // 2. Branch prefix check — also zero API call.
  const head = pr.head?.ref ?? '';
  const headLower = head.toLowerCase();
  for (const prefix of config.detection.branchPrefixes) {
    if (headLower.startsWith(prefix.toLowerCase())) {
      return { source: 'agent', agentKind: kindFromBranch(prefix), matchedRule: 'branch' };
    }
  }

  // 3. Commit trailers — one API call. Skipped when no trailers configured.
  if (config.detection.commitTrailers.length > 0) {
    try {
      const { data: commits } = await octokit.pulls.listCommits({
        owner: pr.base.repo.owner.login,
        repo: pr.base.repo.name,
        pull_number: pr.number,
        per_page: 100,
      });
      for (const commit of commits) {
        const msg = commit.commit.message ?? '';
        for (const trailer of config.detection.commitTrailers) {
          if (msg.includes(trailer)) {
            return { source: 'agent', agentKind: kindFromTrailer(trailer), matchedRule: 'trailer' };
          }
        }
      }
    } catch (err) {
      // Best-effort: if the API call fails, treat as human rather than crashing
      // the whole webhook. We log so operators can diagnose quota / auth issues.
      console.warn(
        'classifyPrSource: listCommits failed for %s/%s#%d — falling back to human:',
        pr.base.repo.owner.login,
        pr.base.repo.name,
        pr.number,
        err,
      );
      return { source: 'human' };
    }
  }

  return { source: 'human' };
}
