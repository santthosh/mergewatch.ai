import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySignature, parseReviewMode, shouldHandleReviewCommentEvent } from './webhook.js';
import { REVIEW_TRIGGERING_ACTIONS, COMMENT_LOOKUP_ACTIONS } from '@mergewatch/core';
import type { PullRequestReviewCommentEvent } from '@mergewatch/core';

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
    expect(verifySignature(secret, body, sign(body))).toBe(true);
  });

  it('returns false when signature header is undefined', () => {
    expect(verifySignature(secret, '{}', undefined)).toBe(false);
  });

  it('returns false when signature header is empty string', () => {
    expect(verifySignature(secret, '{}', '')).toBe(false);
  });

  it('returns false for a wrong signature', () => {
    expect(verifySignature(secret, '{}', 'sha256=deadbeef')).toBe(false);
  });

  it('returns false when body has been tampered with', () => {
    const original = '{"action":"opened"}';
    const tampered = '{"action":"closed"}';
    expect(verifySignature(secret, tampered, sign(original))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseReviewMode
// ---------------------------------------------------------------------------

describe('parseReviewMode', () => {
  it('returns "review" for "@mergewatch review"', () => {
    expect(parseReviewMode('@mergewatch review')).toBe('review');
  });

  it('returns "summary" for "@mergewatch summary"', () => {
    expect(parseReviewMode('@mergewatch summary')).toBe('summary');
  });

  it('returns "review" for bare "@mergewatch" at end of string', () => {
    expect(parseReviewMode('@mergewatch')).toBe('review');
  });

  it('returns "respond" for "@mergewatch" followed by arbitrary text', () => {
    expect(parseReviewMode('Hey @mergewatch can you explain this?')).toBe('respond');
  });

  it('returns null when @mergewatch is not mentioned', () => {
    expect(parseReviewMode('This is a regular comment')).toBeNull();
  });

  it('is case-insensitive for @MergeWatch', () => {
    expect(parseReviewMode('@MergeWatch review')).toBe('review');
  });

  it('is case-insensitive for @MERGEWATCH', () => {
    expect(parseReviewMode('@MERGEWATCH summary')).toBe('summary');
  });

  it('returns "review" for "@mergewatch" on its own line in a multi-line comment', () => {
    expect(parseReviewMode('Please review this\n@mergewatch\nThanks')).toBe('review');
  });
});

// ---------------------------------------------------------------------------
// REVIEW_TRIGGERING_ACTIONS & COMMENT_LOOKUP_ACTIONS
// ---------------------------------------------------------------------------

describe('REVIEW_TRIGGERING_ACTIONS', () => {
  it('includes opened, synchronize, ready_for_review, and reopened', () => {
    expect(REVIEW_TRIGGERING_ACTIONS).toContain('opened');
    expect(REVIEW_TRIGGERING_ACTIONS).toContain('synchronize');
    expect(REVIEW_TRIGGERING_ACTIONS).toContain('ready_for_review');
    expect(REVIEW_TRIGGERING_ACTIONS).toContain('reopened');
  });

  it('does not include non-review actions', () => {
    expect(REVIEW_TRIGGERING_ACTIONS).not.toContain('closed');
    expect(REVIEW_TRIGGERING_ACTIONS).not.toContain('edited');
    expect(REVIEW_TRIGGERING_ACTIONS).not.toContain('converted_to_draft');
  });
});

describe('COMMENT_LOOKUP_ACTIONS', () => {
  it('includes actions where existing comments should be looked up', () => {
    expect(COMMENT_LOOKUP_ACTIONS).toContain('synchronize');
    expect(COMMENT_LOOKUP_ACTIONS).toContain('ready_for_review');
    expect(COMMENT_LOOKUP_ACTIONS).toContain('reopened');
  });

  it('does not include opened (first review creates a new comment)', () => {
    expect(COMMENT_LOOKUP_ACTIONS).not.toContain('opened');
  });
});

// ---------------------------------------------------------------------------
// shouldHandleReviewCommentEvent
// ---------------------------------------------------------------------------

describe('shouldHandleReviewCommentEvent', () => {
  function makeEvent(overrides: Partial<PullRequestReviewCommentEvent> = {}): PullRequestReviewCommentEvent {
    return {
      action: 'created',
      sender: { login: 'alice', id: 1, avatar_url: '', type: 'User' },
      installation: { id: 123 },
      comment: {
        id: 1001,
        body: 'reply body',
        pull_request_review_id: null,
        in_reply_to_id: 1000,
        node_id: 'node-id',
        user: { login: 'alice', id: 1, avatar_url: '', type: 'User' },
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
        path: 'src/foo.ts',
        commit_id: 'abc',
      },
      pull_request: { number: 5 } as any,
      repository: { name: 'r', owner: { login: 'o' } } as any,
      ...overrides,
    };
  }

  it('returns true for a valid human reply with installation id', () => {
    expect(shouldHandleReviewCommentEvent(makeEvent())).toBe(true);
  });

  it('returns false for non-created actions', () => {
    expect(shouldHandleReviewCommentEvent(makeEvent({ action: 'edited' }))).toBe(false);
    expect(shouldHandleReviewCommentEvent(makeEvent({ action: 'deleted' }))).toBe(false);
  });

  it('returns false for bot senders (loop guard)', () => {
    expect(shouldHandleReviewCommentEvent(makeEvent({
      sender: { login: 'mergewatch[bot]', id: 2, avatar_url: '', type: 'Bot' },
    }))).toBe(false);
  });

  it('returns false when the comment is not a reply (no in_reply_to_id)', () => {
    const evt = makeEvent();
    delete (evt.comment as any).in_reply_to_id;
    expect(shouldHandleReviewCommentEvent(evt)).toBe(false);
  });

  it('returns false when installation metadata is missing', () => {
    const evt = makeEvent();
    evt.installation = undefined;
    expect(shouldHandleReviewCommentEvent(evt)).toBe(false);
  });
});
