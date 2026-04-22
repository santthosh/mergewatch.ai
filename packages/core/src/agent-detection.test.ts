import { describe, it, expect, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { classifyPrSource } from './agent-detection.js';
import type { GitHubPullRequest } from './types/github.js';
import type { AgentReviewConfig } from './config/defaults.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makePr(overrides?: Partial<GitHubPullRequest>): GitHubPullRequest {
  return {
    number: 42,
    title: 'Add feature',
    body: null,
    state: 'open',
    html_url: 'https://github.com/octo/repo/pull/42',
    head: {
      label: 'octo:feature/foo',
      ref: 'feature/foo',
      sha: 'abc123',
      repo: {
        id: 1,
        name: 'repo',
        full_name: 'octo/repo',
        owner: { login: 'octo', id: 1, avatar_url: '', type: 'User' },
        private: false,
        html_url: '',
        default_branch: 'main',
      },
    },
    base: {
      label: 'octo:main',
      ref: 'main',
      sha: 'def456',
      repo: {
        id: 1,
        name: 'repo',
        full_name: 'octo/repo',
        owner: { login: 'octo', id: 1, avatar_url: '', type: 'User' },
        private: false,
        html_url: '',
        default_branch: 'main',
      },
    },
    user: { login: 'alice', id: 1, avatar_url: '', type: 'User' },
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<AgentReviewConfig>): AgentReviewConfig {
  return {
    enabled: true,
    strictChecks: true,
    autoIterate: true,
    maxIterations: 3,
    passThreshold: 'noCritical',
    detection: {
      commitTrailers: ['Co-authored-by: Claude'],
      branchPrefixes: ['claude/', 'cursor/'],
      labels: ['ai-generated', 'claude-authored'],
    },
    ...overrides,
  };
}

function makeOctokit(listCommitsImpl?: (args: unknown) => unknown): Octokit {
  const impl = listCommitsImpl ?? (() => ({ data: [] }));
  return {
    pulls: {
      listCommits: vi.fn(impl),
    },
  } as unknown as Octokit;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('classifyPrSource', () => {
  it('returns human when config is undefined', async () => {
    const result = await classifyPrSource(makePr(), makeOctokit(), undefined);
    expect(result).toEqual({ source: 'human' });
  });

  it('returns human when detection is disabled', async () => {
    const result = await classifyPrSource(
      makePr({ labels: [{ name: 'ai-generated' }] }),
      makeOctokit(),
      makeConfig({ enabled: false }),
    );
    expect(result).toEqual({ source: 'human' });
  });

  it('classifies as agent when a configured label is present', async () => {
    const result = await classifyPrSource(
      makePr({ labels: [{ name: 'ai-generated' }] }),
      makeOctokit(),
      makeConfig(),
    );
    expect(result.source).toBe('agent');
    expect(result.matchedRule).toBe('label');
    // 'ai-generated' does not include claude/cursor/codex → fallback 'other'
    expect(result.agentKind).toBe('other');
  });

  it('derives agentKind=claude from a claude-* label', async () => {
    const result = await classifyPrSource(
      makePr({ labels: [{ name: 'claude-authored' }] }),
      makeOctokit(),
      makeConfig(),
    );
    expect(result.source).toBe('agent');
    expect(result.agentKind).toBe('claude');
    expect(result.matchedRule).toBe('label');
  });

  it('is case-insensitive on label match', async () => {
    const result = await classifyPrSource(
      makePr({ labels: [{ name: 'AI-Generated' }] }),
      makeOctokit(),
      makeConfig(),
    );
    expect(result.source).toBe('agent');
    expect(result.matchedRule).toBe('label');
  });

  it('classifies as agent when head branch starts with a configured prefix', async () => {
    const result = await classifyPrSource(
      makePr({ head: { ...makePr().head, ref: 'claude/fix-bug' } }),
      makeOctokit(),
      makeConfig(),
    );
    expect(result.source).toBe('agent');
    expect(result.matchedRule).toBe('branch');
    expect(result.agentKind).toBe('claude');
  });

  it('derives agentKind=cursor from cursor/ prefix', async () => {
    const result = await classifyPrSource(
      makePr({ head: { ...makePr().head, ref: 'cursor/refactor' } }),
      makeOctokit(),
      makeConfig(),
    );
    expect(result.agentKind).toBe('cursor');
  });

  it('calls listCommits only when commitTrailers is non-empty', async () => {
    const octokit = makeOctokit();
    await classifyPrSource(
      makePr(),
      octokit,
      makeConfig({ detection: { commitTrailers: [], branchPrefixes: [], labels: [] } }),
    );
    expect((octokit.pulls.listCommits as any)).not.toHaveBeenCalled();
  });

  it('classifies as agent when a configured commit trailer is found', async () => {
    const octokit = makeOctokit(() => ({
      data: [
        { commit: { message: 'chore: bump deps\n\nCo-authored-by: Claude <noreply@anthropic.com>' } },
      ],
    }));
    const result = await classifyPrSource(makePr(), octokit, makeConfig());
    expect(result.source).toBe('agent');
    expect(result.matchedRule).toBe('trailer');
    expect(result.agentKind).toBe('claude');
  });

  it('returns human when no rules match', async () => {
    const octokit = makeOctokit(() => ({
      data: [{ commit: { message: 'Unrelated commit message' } }],
    }));
    const result = await classifyPrSource(makePr(), octokit, makeConfig());
    expect(result).toEqual({ source: 'human' });
  });

  it('falls back to human when listCommits throws', async () => {
    const octokit = makeOctokit(() => {
      throw new Error('API rate limit exceeded');
    });
    // Silence the warn log
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await classifyPrSource(makePr(), octokit, makeConfig());
    expect(result).toEqual({ source: 'human' });
    spy.mockRestore();
  });

  it('label match wins over branch match (order matters)', async () => {
    const result = await classifyPrSource(
      makePr({
        labels: [{ name: 'ai-generated' }],
        head: { ...makePr().head, ref: 'claude/fix' },
      }),
      makeOctokit(),
      makeConfig(),
    );
    expect(result.matchedRule).toBe('label');
    expect(result.agentKind).toBe('other');
  });

  it('branch match wins over trailer match (order matters)', async () => {
    const listCommits = vi.fn(() => ({
      data: [{ commit: { message: 'Co-authored-by: Claude' } }],
    }));
    const octokit = {
      pulls: { listCommits },
    } as unknown as Octokit;
    const result = await classifyPrSource(
      makePr({ head: { ...makePr().head, ref: 'cursor/refactor' } }),
      octokit,
      makeConfig(),
    );
    expect(result.matchedRule).toBe('branch');
    expect(result.agentKind).toBe('cursor');
    // listCommits should not have been invoked since branch matched first
    expect(listCommits).not.toHaveBeenCalled();
  });

  it('defaults agentKind to "other" when no kind keyword is in the matched string', async () => {
    const result = await classifyPrSource(
      makePr({ head: { ...makePr().head, ref: 'bot/something' } }),
      makeOctokit(),
      makeConfig({
        detection: {
          commitTrailers: [],
          branchPrefixes: ['bot/'],
          labels: [],
        },
      }),
    );
    expect(result.source).toBe('agent');
    expect(result.agentKind).toBe('other');
  });
});
