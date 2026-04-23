import { describe, it, expect } from 'vitest';
import type { McpSessionRecord } from '@mergewatch/core';
import {
  computeBillingDelta,
  computeSessionTtl,
  isSessionActive,
  SESSION_TTL_SECONDS,
} from './session-math.js';

function sess(over: Partial<McpSessionRecord> = {}): McpSessionRecord {
  return {
    sessionId: 's1',
    installationId: 'i1',
    firstBilledAt: '2026-04-19T00:00:00.000Z',
    maxBilledCents: 0,
    iteration: 0,
    ttl: 0,
    ...over,
  };
}

describe('computeBillingDelta', () => {
  it('first call with no session bills full cost, iteration=1', () => {
    expect(computeBillingDelta(null, 50)).toEqual({
      billCents: 50,
      newMaxBilledCents: 50,
      newIteration: 1,
    });
  });

  it('first call with zero cost still produces iteration=1', () => {
    expect(computeBillingDelta(null, 0)).toEqual({
      billCents: 0,
      newMaxBilledCents: 0,
      newIteration: 1,
    });
  });

  it('cheaper iteration bills 0 and leaves max unchanged', () => {
    const prior = sess({ maxBilledCents: 80, iteration: 1 });
    expect(computeBillingDelta(prior, 30)).toEqual({
      billCents: 0,
      newMaxBilledCents: 80,
      newIteration: 2,
    });
  });

  it('more expensive iteration bills only the delta and raises max', () => {
    const prior = sess({ maxBilledCents: 40, iteration: 3 });
    expect(computeBillingDelta(prior, 100)).toEqual({
      billCents: 60,
      newMaxBilledCents: 100,
      newIteration: 4,
    });
  });

  it('equal-cost iteration bills 0', () => {
    const prior = sess({ maxBilledCents: 75, iteration: 2 });
    expect(computeBillingDelta(prior, 75)).toEqual({
      billCents: 0,
      newMaxBilledCents: 75,
      newIteration: 3,
    });
  });

  it('iteration counter increments across a sequence of calls', () => {
    let s: McpSessionRecord | null = null;
    const seq = [10, 20, 5, 25, 25];
    const results = seq.map((cost) => {
      const d = computeBillingDelta(s, cost);
      s = sess({ maxBilledCents: d.newMaxBilledCents, iteration: d.newIteration });
      return d;
    });
    expect(results.map((r) => r.newIteration)).toEqual([1, 2, 3, 4, 5]);
    expect(results.map((r) => r.billCents)).toEqual([10, 10, 0, 5, 0]);
    expect(results.at(-1)!.newMaxBilledCents).toBe(25);
  });
});

describe('computeSessionTtl', () => {
  it('returns firstBilledAt + 1800s', () => {
    const firstBilledAt = '2026-04-19T00:00:00.000Z';
    const base = Math.floor(new Date(firstBilledAt).getTime() / 1000);
    expect(computeSessionTtl(firstBilledAt)).toBe(base + SESSION_TTL_SECONDS);
    expect(SESSION_TTL_SECONDS).toBe(1800);
  });
});

describe('isSessionActive', () => {
  it('returns true when ttl is in the future', () => {
    const now = new Date('2026-04-19T00:10:00.000Z').getTime();
    const s = sess({ ttl: Math.floor(now / 1000) + 60 });
    expect(isSessionActive(s, now)).toBe(true);
  });

  it('returns false when ttl has passed', () => {
    const now = new Date('2026-04-19T01:00:00.000Z').getTime();
    const s = sess({ ttl: Math.floor(now / 1000) - 1 });
    expect(isSessionActive(s, now)).toBe(false);
  });
});
