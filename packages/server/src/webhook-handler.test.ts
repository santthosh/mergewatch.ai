import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifySignature, parseReviewMode } from './webhook-handler.js';

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

  it('returns mode "review" when no @mergewatch is mentioned (default)', () => {
    expect(parseReviewMode('This is a regular comment')).toEqual({ mode: 'review' });
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
