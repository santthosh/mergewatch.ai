import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Octokit } from '@octokit/rest';
import type { ILLMProvider } from '../llm/types.js';
import { handleInlineReply, detectResolveIntent, MAX_BOT_REPLIES } from './inline-reply.js';

// ─── detectResolveIntent ────────────────────────────────────────────────────

describe('detectResolveIntent', () => {
  it('matches the standalone /resolve command', () => {
    expect(detectResolveIntent('/resolve')).toBe(true);
    expect(detectResolveIntent('  /resolve  ')).toBe(true);
    expect(detectResolveIntent('Thanks! /resolve')).toBe(true);
  });

  it('matches a bare "resolve" reply', () => {
    expect(detectResolveIntent('resolve')).toBe(true);
    expect(detectResolveIntent('Resolve')).toBe(true);
    expect(detectResolveIntent('resolve.')).toBe(true);
  });

  it('matches common affirmative phrasings', () => {
    expect(detectResolveIntent('resolved')).toBe(true);
    expect(detectResolveIntent('Please resolve')).toBe(true);
    expect(detectResolveIntent('Mergewatch resolve')).toBe(true);
    expect(detectResolveIntent('yes, resolve')).toBe(true);
  });

  it("does NOT match prose that happens to contain the word resolve", () => {
    expect(detectResolveIntent("Here's how I'd resolve this differently.")).toBe(false);
    expect(detectResolveIntent('This will not resolve the underlying issue.')).toBe(false);
    expect(detectResolveIntent('I want to resolve it in a follow-up PR.')).toBe(false);
  });

  it('does not match on empty input', () => {
    expect(detectResolveIntent('')).toBe(false);
    expect(detectResolveIntent('   ')).toBe(false);
  });
});

// ─── handleInlineReply ──────────────────────────────────────────────────────

interface MockOctokitCalls {
  listReviewComments: ReturnType<typeof vi.fn>;
  createReplyForReviewComment: ReturnType<typeof vi.fn>;
  createForPullRequestReviewComment: ReturnType<typeof vi.fn>;
  deleteForPullRequestComment: ReturnType<typeof vi.fn>;
  graphql: ReturnType<typeof vi.fn>;
}

function makeOctokitMock(comments: Array<{
  id: number;
  body: string;
  user: { login: string; type: 'User' | 'Bot' };
  in_reply_to_id?: number;
  created_at?: string;
}>): { octokit: Octokit; calls: MockOctokitCalls } {
  const calls: MockOctokitCalls = {
    listReviewComments: vi.fn(async () => ({ data: comments })),
    createReplyForReviewComment: vi.fn(async () => ({ data: { id: 99999 } })),
    createForPullRequestReviewComment: vi.fn(async () => ({ data: { id: 777 } })),
    deleteForPullRequestComment: vi.fn(async () => ({})),
    graphql: vi.fn(async () => ({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [{ id: 'THREAD_NODE_ID', comments: { nodes: comments.map((c) => ({ databaseId: c.id })) } }],
          },
        },
      },
    })),
  };
  const octokit = {
    pulls: {
      listReviewComments: calls.listReviewComments,
      createReplyForReviewComment: calls.createReplyForReviewComment,
    },
    reactions: {
      createForPullRequestReviewComment: calls.createForPullRequestReviewComment,
      deleteForPullRequestComment: calls.deleteForPullRequestComment,
    },
    graphql: calls.graphql,
  } as unknown as Octokit;
  return { octokit, calls };
}

function makeLLM(response: string): ILLMProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async invoke(_modelId: string, prompt: string) {
      calls.push(prompt);
      return { text: response };
    },
  };
}

const baseComments = [
  { id: 100, body: 'Missing try/catch around this call.', user: { login: 'mergewatch[bot]', type: 'Bot' as const }, created_at: '2026-04-01T00:00:00Z' },
  { id: 101, body: 'We handle errors with middleware — see packages/server/middleware/error.ts.', user: { login: 'santthosh', type: 'User' as const }, in_reply_to_id: 100, created_at: '2026-04-01T01:00:00Z' },
];

describe('handleInlineReply', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips when the thread root is not bot-authored', async () => {
    const { octokit } = makeOctokitMock([
      { id: 100, body: 'human top comment', user: { login: 'alice', type: 'User' } },
      { id: 101, body: 'reply', user: { login: 'bob', type: 'User' }, in_reply_to_id: 100 },
    ]);
    const llm = makeLLM('unused');
    const result = await handleInlineReply(
      { owner: 'o', repo: 'r', prNumber: 1, replyCommentId: 101 },
      { octokit, llm, lightModelId: 'light' },
    );
    expect(result.action).toBe('skipped');
    expect(llm.calls).toHaveLength(0);
  });

  it('skips when the reply is not at the tip of the thread', async () => {
    // replyCommentId points to the root, not the latest comment
    const { octokit } = makeOctokitMock(baseComments);
    const llm = makeLLM('unused');
    const result = await handleInlineReply(
      { owner: 'o', repo: 'r', prNumber: 1, replyCommentId: 100 },
      { octokit, llm, lightModelId: 'light' },
    );
    expect(result.action).toBe('skipped');
  });

  it('resolves the thread on explicit resolve intent without calling the LLM', async () => {
    const { octokit, calls } = makeOctokitMock([
      ...baseComments,
      { id: 102, body: '/resolve', user: { login: 'santthosh', type: 'User' as const }, in_reply_to_id: 101, created_at: '2026-04-01T02:00:00Z' },
    ]);
    const llm = makeLLM('unused');
    const result = await handleInlineReply(
      { owner: 'o', repo: 'r', prNumber: 1, replyCommentId: 102 },
      { octokit, llm, lightModelId: 'light' },
    );
    expect(result.action).toBe('resolved');
    expect(llm.calls).toHaveLength(0);
    expect(calls.graphql).toHaveBeenCalled();
    // Eyes reaction added + removed
    expect(calls.createForPullRequestReviewComment).toHaveBeenCalled();
    expect(calls.deleteForPullRequestComment).toHaveBeenCalled();
  });

  it('calls the LLM and posts a threaded reply on normal replies', async () => {
    const { octokit, calls } = makeOctokitMock(baseComments);
    const agentResponse = JSON.stringify({
      reply: 'Got it — middleware makes sense here. Reply `resolve` to close this thread.',
      recommendation: 'resolve',
      reasoning: 'valid convention-based dismissal',
    });
    const llm = makeLLM(agentResponse);
    const result = await handleInlineReply(
      { owner: 'o', repo: 'r', prNumber: 1, replyCommentId: 101 },
      { octokit, llm, lightModelId: 'light' },
    );
    expect(result.action).toBe('replied');
    expect(result.recommendation).toBe('resolve');
    expect(result.botCommentId).toBe(99999);
    expect(calls.createReplyForReviewComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 100, body: expect.stringContaining('middleware') }),
    );
    // Eyes reaction was added then removed
    expect(calls.createForPullRequestReviewComment).toHaveBeenCalled();
    expect(calls.deleteForPullRequestComment).toHaveBeenCalled();
  });

  it('stops engaging once the thread already has MAX_BOT_REPLIES bot replies', async () => {
    const thread = [
      { id: 100, body: 'finding', user: { login: 'mergewatch[bot]', type: 'Bot' as const }, created_at: '2026-04-01T00:00:00Z' },
      { id: 101, body: 'disagree', user: { login: 'alice', type: 'User' as const }, in_reply_to_id: 100, created_at: '2026-04-01T01:00:00Z' },
      { id: 102, body: 'reply 1', user: { login: 'mergewatch[bot]', type: 'Bot' as const }, in_reply_to_id: 100, created_at: '2026-04-01T02:00:00Z' },
      { id: 103, body: 'nope', user: { login: 'alice', type: 'User' as const }, in_reply_to_id: 100, created_at: '2026-04-01T03:00:00Z' },
      { id: 104, body: 'reply 2', user: { login: 'mergewatch[bot]', type: 'Bot' as const }, in_reply_to_id: 100, created_at: '2026-04-01T04:00:00Z' },
      { id: 105, body: 'still nope', user: { login: 'alice', type: 'User' as const }, in_reply_to_id: 100, created_at: '2026-04-01T05:00:00Z' },
      { id: 106, body: 'reply 3', user: { login: 'mergewatch[bot]', type: 'Bot' as const }, in_reply_to_id: 100, created_at: '2026-04-01T06:00:00Z' },
      { id: 107, body: 'one more', user: { login: 'alice', type: 'User' as const }, in_reply_to_id: 100, created_at: '2026-04-01T07:00:00Z' },
    ];
    expect(thread.filter((c) => c.user.type === 'Bot').length).toBe(MAX_BOT_REPLIES + 1);
    const { octokit, calls } = makeOctokitMock(thread);
    const llm = makeLLM('should not be called');
    const result = await handleInlineReply(
      { owner: 'o', repo: 'r', prNumber: 1, replyCommentId: 107 },
      { octokit, llm, lightModelId: 'light' },
    );
    expect(result.action).toBe('skipped');
    expect(llm.calls).toHaveLength(0);
    expect(calls.createReplyForReviewComment).not.toHaveBeenCalled();
  });

  it('removes the eyes reaction even when the LLM throws', async () => {
    const { octokit, calls } = makeOctokitMock(baseComments);
    const llm: ILLMProvider = {
      invoke: vi.fn(async () => { throw new Error('boom'); }),
    };
    await expect(handleInlineReply(
      { owner: 'o', repo: 'r', prNumber: 1, replyCommentId: 101 },
      { octokit, llm, lightModelId: 'light' },
    )).rejects.toThrow('boom');
    expect(calls.deleteForPullRequestComment).toHaveBeenCalled();
  });
});
