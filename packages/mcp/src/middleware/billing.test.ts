import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMcpSessionStore, McpSessionRecord } from '@mergewatch/core';
import {
  BillingBlockedError,
  checkMcpBilling,
  mintSessionId,
  recordMcpReview,
  resolveOrCreateSession,
} from './billing.js';
import { computeSessionTtl } from '../session-math.js';

function makeSessionStore(initial: McpSessionRecord | null = null): IMcpSessionStore & {
  _last?: McpSessionRecord;
} {
  const store: any = {
    _last: undefined,
    get: vi.fn().mockResolvedValue(initial),
    upsert: vi.fn().mockImplementation(async (rec: McpSessionRecord) => {
      store._last = rec;
    }),
  };
  return store;
}

const ddb = { send: vi.fn() } as any;
const TABLE = 'installations-test';

describe('checkMcpBilling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns silently on allow', async () => {
    const billing = {
      check: vi.fn().mockResolvedValue({ status: 'allow', firstBlock: false }),
    };
    await expect(checkMcpBilling('inst-1', billing, ddb, TABLE)).resolves.toBeUndefined();
    expect(billing.check).toHaveBeenCalledWith(ddb, TABLE, 'inst-1');
  });

  it('throws BillingBlockedError on block', async () => {
    const billing = {
      check: vi.fn().mockResolvedValue({ status: 'block', firstBlock: true }),
    };
    await expect(checkMcpBilling('inst-9', billing, ddb, TABLE)).rejects.toBeInstanceOf(
      BillingBlockedError,
    );
  });

  it('surfaces firstBlock on the error', async () => {
    const billing = {
      check: vi.fn().mockResolvedValue({ status: 'block', firstBlock: false }),
    };
    try {
      await checkMcpBilling('inst-2', billing, ddb, TABLE);
    } catch (err) {
      expect(err).toBeInstanceOf(BillingBlockedError);
      expect((err as BillingBlockedError).firstBlock).toBe(false);
      expect((err as BillingBlockedError).installationId).toBe('inst-2');
    }
  });
});

describe('mintSessionId', () => {
  it('returns unique, prefixed ids', () => {
    const a = mintSessionId();
    const b = mintSessionId();
    expect(a).not.toBe(b);
    expect(a.startsWith('mcp-')).toBe(true);
  });
});

describe('resolveOrCreateSession', () => {
  it('mints a new id when no sessionId is provided', async () => {
    const store = makeSessionStore(null);
    const res = await resolveOrCreateSession(store, undefined);
    expect(res.isNew).toBe(true);
    expect(res.session).toBeNull();
    expect(res.sessionId.startsWith('mcp-')).toBe(true);
    expect(store.get).not.toHaveBeenCalled();
  });

  it('preserves the caller sessionId when no record exists', async () => {
    const store = makeSessionStore(null);
    const res = await resolveOrCreateSession(store, 'sess-custom');
    expect(res.isNew).toBe(true);
    expect(res.session).toBeNull();
    expect(res.sessionId).toBe('sess-custom');
  });

  it('returns the existing session when within TTL', async () => {
    const now = new Date('2026-04-19T00:10:00.000Z').getTime();
    const existing: McpSessionRecord = {
      sessionId: 'sess-1',
      installationId: 'inst-1',
      firstBilledAt: '2026-04-19T00:00:00.000Z',
      maxBilledCents: 40,
      iteration: 2,
      ttl: Math.floor(now / 1000) + 120,
    };
    const store = makeSessionStore(existing);
    const res = await resolveOrCreateSession(store, 'sess-1', now);
    expect(res.isNew).toBe(false);
    expect(res.session).toEqual(existing);
    expect(res.sessionId).toBe('sess-1');
  });

  it('treats an expired session as new but reuses the id', async () => {
    const now = new Date('2026-04-19T01:00:00.000Z').getTime();
    const expired: McpSessionRecord = {
      sessionId: 'sess-old',
      installationId: 'inst-1',
      firstBilledAt: '2026-04-19T00:00:00.000Z',
      maxBilledCents: 40,
      iteration: 5,
      ttl: Math.floor(now / 1000) - 5,
    };
    const store = makeSessionStore(expired);
    const res = await resolveOrCreateSession(store, 'sess-old', now);
    expect(res.isNew).toBe(true);
    expect(res.session).toBeNull();
    expect(res.sessionId).toBe('sess-old');
  });
});

describe('recordMcpReview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists the session row with fresh ttl and calls billing.record with session-scoped key', async () => {
    const store = makeSessionStore();
    const billing = { record: vi.fn().mockResolvedValue(undefined) };
    const firstBilledAt = '2026-04-19T00:00:00.000Z';
    await recordMcpReview(store, billing, ddb, TABLE, {
      installationId: 'inst-7',
      sessionId: 'sess-abc',
      firstBilledAt,
      costCents: 80,
      delta: { billCents: 40, newMaxBilledCents: 80, newIteration: 3 },
    });
    expect(store.upsert).toHaveBeenCalledOnce();
    const upserted = (store.upsert as any).mock.calls[0][0];
    expect(upserted).toEqual({
      sessionId: 'sess-abc',
      installationId: 'inst-7',
      firstBilledAt,
      maxBilledCents: 80,
      iteration: 3,
      ttl: computeSessionTtl(firstBilledAt),
    });
    expect(billing.record).toHaveBeenCalledWith(
      ddb,
      TABLE,
      'inst-7',
      0.4,
      'mcp-sess-abc-3',
      undefined,
    );
  });

  it('passes a Stripe client through when provided', async () => {
    const store = makeSessionStore();
    const billing = { record: vi.fn().mockResolvedValue(undefined) };
    const stripe = {} as any;
    await recordMcpReview(
      store,
      billing,
      ddb,
      TABLE,
      {
        installationId: 'inst-1',
        sessionId: 'sess-1',
        firstBilledAt: '2026-04-19T00:00:00.000Z',
        costCents: 0,
        delta: { billCents: 0, newMaxBilledCents: 0, newIteration: 1 },
      },
      stripe,
    );
    expect(billing.record).toHaveBeenCalledWith(
      ddb,
      TABLE,
      'inst-1',
      0,
      'mcp-sess-1-1',
      stripe,
    );
  });
});
