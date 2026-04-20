import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresMcpSessionStore } from './mcp-session-store';
import { mcpSessions } from './schema';

function chain(result: any) {
  const p: any = {
    select: vi.fn(() => p),
    from: vi.fn(() => p),
    where: vi.fn(() => p),
    limit: vi.fn(() => p),
    insert: vi.fn(() => p),
    values: vi.fn(() => p),
    onConflictDoUpdate: vi.fn(() => Promise.resolve(undefined)),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return p;
}

describe('PostgresMcpSessionStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('get returns null when no row', async () => {
    const db: any = chain([]);
    const store = new PostgresMcpSessionStore(db);
    expect(await store.get('missing')).toBeNull();
  });

  it('get hydrates record and converts expiresAt -> ttl (epoch seconds)', async () => {
    const firstBilledAt = new Date('2026-04-19T00:00:00.000Z');
    const expiresAt = new Date('2026-04-19T00:30:00.000Z');
    const db: any = chain([
      {
        sessionId: 's',
        installationId: 'inst-1',
        firstBilledAt,
        maxBilledCents: 50,
        iteration: 3,
        expiresAt,
      },
    ]);
    const store = new PostgresMcpSessionStore(db);
    const got = await store.get('s');
    expect(got).toEqual({
      sessionId: 's',
      installationId: 'inst-1',
      firstBilledAt: '2026-04-19T00:00:00.000Z',
      maxBilledCents: 50,
      iteration: 3,
      ttl: Math.floor(expiresAt.getTime() / 1000),
    });
  });

  it('upsert maps ttl -> expiresAt and uses onConflictDoUpdate', async () => {
    const db: any = chain(undefined);
    const store = new PostgresMcpSessionStore(db);
    const firstBilledAt = '2026-04-19T00:00:00.000Z';
    const ttl = Math.floor(new Date(firstBilledAt).getTime() / 1000) + 1800;
    await store.upsert({
      sessionId: 's',
      installationId: 'inst-1',
      firstBilledAt,
      maxBilledCents: 25,
      iteration: 1,
      ttl,
    });
    expect(db.insert).toHaveBeenCalledWith(mcpSessions);
    expect(db.values).toHaveBeenCalledWith({
      sessionId: 's',
      installationId: 'inst-1',
      firstBilledAt: new Date(firstBilledAt),
      maxBilledCents: 25,
      iteration: 1,
      expiresAt: new Date(ttl * 1000),
    });
    expect(db.onConflictDoUpdate).toHaveBeenCalled();
  });

  it('ttl roundtrip is stable across upsert + get', async () => {
    const firstBilledAt = '2026-04-19T00:00:00.000Z';
    const ttl = Math.floor(new Date(firstBilledAt).getTime() / 1000) + 1800;
    const expiresAt = new Date(ttl * 1000);
    const db: any = chain([
      {
        sessionId: 's',
        installationId: 'inst-1',
        firstBilledAt: new Date(firstBilledAt),
        maxBilledCents: 0,
        iteration: 1,
        expiresAt,
      },
    ]);
    const store = new PostgresMcpSessionStore(db);
    const got = await store.get('s');
    expect(got?.ttl).toBe(ttl);
  });
});
