import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

// Mock the review-processor BEFORE importing the webhook handler so we can
// capture the ReviewJobPayload it's handed without actually running a review.
const mockProcessReviewJob = vi.fn().mockResolvedValue(undefined);
vi.mock('./review-processor.js', () => ({
  processReviewJob: (...args: unknown[]) => mockProcessReviewJob(...args),
}));

const mockFindExistingBotComment = vi.fn().mockResolvedValue(null);
const mockFetchRepoConfig = vi.fn().mockResolvedValue(null);
const mockClassifyPrSource = vi.fn().mockResolvedValue({ source: 'human' });

vi.mock('@mergewatch/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mergewatch/core')>();
  return {
    ...actual,
    findExistingBotComment: (...args: unknown[]) => mockFindExistingBotComment(...args),
    fetchRepoConfig: (...args: unknown[]) => mockFetchRepoConfig(...args),
    classifyPrSource: (...args: unknown[]) => mockClassifyPrSource(...args),
  };
});

import { verifySignature, parseReviewMode, createWebhookHandler } from './webhook-handler.js';
import type { WebhookDeps } from './webhook-handler.js';
import type { IInstallationStore, IReviewStore, IGitHubAuthProvider, ILLMProvider, PullRequestEvent } from '@mergewatch/core';

// ---------------------------------------------------------------------------
// verifySignature
// ---------------------------------------------------------------------------

describe('verifySignature', () => {
  const secret = 'test-webhook-secret';

  function sign(body: string): string {
    return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  }

  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = '{"action":"opened"}';
    expect(verifySignature(body, sign(body), secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifySignature('{}', 'sha256=deadbeef', secret)).toBe(false);
  });

  it('returns false when signature length mismatches', () => {
    expect(verifySignature('{}', 'sha256=abc', secret)).toBe(false);
  });

  it('returns false when body has been tampered with', () => {
    const original = '{"action":"opened"}';
    const tampered = '{"action":"closed"}';
    expect(verifySignature(tampered, sign(original), secret)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseReviewMode
// ---------------------------------------------------------------------------

describe('parseReviewMode', () => {
  it('returns mode "review" for "@mergewatch review"', () => {
    expect(parseReviewMode('@mergewatch review')).toEqual({ mode: 'review' });
  });

  it('returns mode "summary" for "@mergewatch summary"', () => {
    expect(parseReviewMode('@mergewatch summary')).toEqual({ mode: 'summary' });
  });

  it('returns mode "respond" with userComment for bare "@mergewatch" mention', () => {
    const body = 'Hey @mergewatch can you explain this?';
    expect(parseReviewMode(body)).toEqual({ mode: 'respond', userComment: body });
  });

  it('returns null when no @mergewatch is mentioned', () => {
    expect(parseReviewMode('This is a regular comment')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(parseReviewMode('@MERGEWATCH review')).toEqual({ mode: 'review' });
  });

  it('returns mode "respond" for @mergewatch with unknown subcommand', () => {
    const body = '@mergewatch explain the security implications';
    expect(parseReviewMode(body)).toEqual({ mode: 'respond', userComment: body });
  });

  it('handles @mergewatch alone (defaults to respond since includes check)', () => {
    // "@mergewatch" alone lowercase includes "@mergewatch" so it hits respond
    const body = '@mergewatch';
    expect(parseReviewMode(body)).toEqual({ mode: 'respond', userComment: body });
  });

  it('trims whitespace before checking', () => {
    expect(parseReviewMode('  @mergewatch summary  ')).toEqual({ mode: 'summary' });
  });
});

// ---------------------------------------------------------------------------
// createWebhookHandler — agent-source classification on pull_request events
// ---------------------------------------------------------------------------

function makePullRequestEvent(overrides: Partial<PullRequestEvent> = {}): PullRequestEvent {
  return {
    action: 'opened',
    number: 7,
    pull_request: {
      number: 7,
      title: 'Automated change',
      body: null,
      state: 'open',
      html_url: 'https://github.com/octo/repo/pull/7',
      head: {
        label: 'octo:claude/fix-bug',
        ref: 'claude/fix-bug',
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
      draft: false,
      labels: [],
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
    repository: {
      id: 1,
      name: 'repo',
      full_name: 'octo/repo',
      owner: { login: 'octo', id: 1, avatar_url: '', type: 'User' },
      private: false,
      html_url: '',
      default_branch: 'main',
    },
    installation: { id: 999 },
    sender: { login: 'alice', id: 1, avatar_url: '', type: 'User' },
    ...overrides,
  };
}

function makeDeps(): WebhookDeps {
  return {
    webhookSecret: 'test-secret',
    installationStore: {
      get: vi.fn(),
      getSettings: vi.fn(),
      upsert: vi.fn(),
    } as unknown as IInstallationStore,
    reviewStore: {
      claimReview: vi.fn(),
      updateStatus: vi.fn(),
      queryByPR: vi.fn(),
      upsert: vi.fn(),
    } as unknown as IReviewStore,
    authProvider: {
      getInstallationOctokit: vi.fn().mockResolvedValue({}),
    } as unknown as IGitHubAuthProvider,
    llm: { invoke: vi.fn() } as unknown as ILLMProvider,
    dashboardBaseUrl: 'https://mergewatch.ai',
  };
}

function signBody(body: string, secret = 'test-secret'): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

function makeReqRes(rawBody: string, event = 'pull_request') {
  const req = {
    headers: {
      'x-hub-signature-256': signBody(rawBody),
      'x-github-event': event,
    },
    body: JSON.parse(rawBody),
    rawBody,
  } as any;
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const res = { status, json } as any;
  return { req, res };
}

describe('createWebhookHandler — pull_request classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchRepoConfig.mockResolvedValue(null);
    mockClassifyPrSource.mockResolvedValue({ source: 'human' });
    mockFindExistingBotComment.mockResolvedValue(null);
  });

  it('propagates source=agent and agentKind into the review job', async () => {
    mockFetchRepoConfig.mockResolvedValue({
      agentReview: { enabled: true, detection: { branchPrefixes: ['claude/'] } },
    });
    mockClassifyPrSource.mockResolvedValue({
      source: 'agent',
      agentKind: 'claude',
      matchedRule: 'branch',
    });

    const deps = makeDeps();
    const handler = createWebhookHandler(deps);
    const body = JSON.stringify(makePullRequestEvent());
    const { req, res } = makeReqRes(body);

    await handler(req, res);
    // processReviewJob is called fire-and-forget; await a microtask so the
    // awaited classification chain completes before we assert.
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockClassifyPrSource).toHaveBeenCalledTimes(1);
    expect(mockProcessReviewJob).toHaveBeenCalledTimes(1);
    const job = mockProcessReviewJob.mock.calls[0][0];
    expect(job.source).toBe('agent');
    expect(job.agentKind).toBe('claude');
  });

  it('passes source=human when classifier returns human', async () => {
    const deps = makeDeps();
    const handler = createWebhookHandler(deps);
    const body = JSON.stringify(makePullRequestEvent());
    const { req, res } = makeReqRes(body);

    await handler(req, res);
    await new Promise((resolve) => setImmediate(resolve));

    const job = mockProcessReviewJob.mock.calls[0][0];
    expect(job.source).toBe('human');
    expect(job.agentKind).toBeUndefined();
  });

  it('passes undefined agentReview config when YAML lacks agentReview', async () => {
    mockFetchRepoConfig.mockResolvedValue(null);
    const deps = makeDeps();
    const handler = createWebhookHandler(deps);
    const body = JSON.stringify(makePullRequestEvent());
    const { req, res } = makeReqRes(body);

    await handler(req, res);
    await new Promise((resolve) => setImmediate(resolve));

    const callArgs = mockClassifyPrSource.mock.calls[0];
    expect(callArgs[2]).toBeUndefined();
  });

  it('populates agentReview config when YAML opts in', async () => {
    mockFetchRepoConfig.mockResolvedValue({ agentReview: { enabled: true } });
    const deps = makeDeps();
    const handler = createWebhookHandler(deps);
    const body = JSON.stringify(makePullRequestEvent());
    const { req, res } = makeReqRes(body);

    await handler(req, res);
    await new Promise((resolve) => setImmediate(resolve));

    const callArgs = mockClassifyPrSource.mock.calls[0];
    expect(callArgs[2]).toBeDefined();
    expect(callArgs[2].enabled).toBe(true);
    expect(callArgs[2].detection).toBeDefined();
  });
});
