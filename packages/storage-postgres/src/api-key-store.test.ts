import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresApiKeyStore } from './api-key-store';
import { apiKeys } from './schema';

/**
 * Drizzle's query builder chains .select().from().where().limit() and
 * terminates on await. We model each call as a thenable chain that ultimately
 * resolves to the configured result.
 */
function chain(result: any) {
  const p: any = {
    select: vi.fn(() => p),
    from: vi.fn(() => p),
    where: vi.fn(() => p),
    limit: vi.fn(() => p),
    insert: vi.fn(() => p),
    values: vi.fn(() => Promise.resolve(result)),
    update: vi.fn(() => p),
    set: vi.fn(() => p),
    delete: vi.fn(() => p),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return p;
}

describe('PostgresApiKeyStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('create inserts the record with createdAt as Date', async () => {
    const db: any = chain(undefined);
    const store = new PostgresApiKeyStore(db);
    await store.create({
      keyHash: 'h',
      installationId: 'inst-1',
      label: 'dev',
      scope: 'all',
      createdBy: 'u',
      createdAt: '2026-04-19T00:00:00.000Z',
    });
    expect(db.insert).toHaveBeenCalledWith(apiKeys);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        keyHash: 'h',
        installationId: 'inst-1',
        label: 'dev',
        scope: 'all',
        createdBy: 'u',
        createdAt: new Date('2026-04-19T00:00:00.000Z'),
      }),
    );
  });

  it('getByHash returns null when no row', async () => {
    const db: any = chain([]);
    const store = new PostgresApiKeyStore(db);
    expect(await store.getByHash('missing')).toBeNull();
  });

  it('getByHash returns hydrated record including lastUsedAt when present', async () => {
    const createdAt = new Date('2026-04-19T00:00:00.000Z');
    const lastUsedAt = new Date('2026-04-19T12:00:00.000Z');
    const db: any = chain([
      {
        keyHash: 'h',
        installationId: 'inst-1',
        label: 'dev',
        scope: ['octocat/hello'],
        createdBy: 'u',
        createdAt,
        lastUsedAt,
      },
    ]);
    const store = new PostgresApiKeyStore(db);
    expect(await store.getByHash('h')).toEqual({
      keyHash: 'h',
      installationId: 'inst-1',
      label: 'dev',
      scope: ['octocat/hello'],
      createdBy: 'u',
      createdAt: '2026-04-19T00:00:00.000Z',
      lastUsedAt: '2026-04-19T12:00:00.000Z',
    });
  });

  it('getByHash omits lastUsedAt when null', async () => {
    const db: any = chain([
      {
        keyHash: 'h',
        installationId: 'inst-1',
        label: 'dev',
        scope: 'all',
        createdBy: 'u',
        createdAt: new Date('2026-04-19T00:00:00.000Z'),
        lastUsedAt: null,
      },
    ]);
    const store = new PostgresApiKeyStore(db);
    const got = await store.getByHash('h');
    expect(got?.lastUsedAt).toBeUndefined();
  });

  it('listByInstallation maps each row', async () => {
    const db: any = chain([
      {
        keyHash: 'a',
        installationId: 'inst-1',
        label: 'x',
        scope: 'all',
        createdBy: 'u',
        createdAt: new Date('2026-04-19T00:00:00.000Z'),
        lastUsedAt: null,
      },
      {
        keyHash: 'b',
        installationId: 'inst-1',
        label: 'y',
        scope: ['o/r'],
        createdBy: 'u',
        createdAt: new Date('2026-04-19T00:00:00.000Z'),
        lastUsedAt: null,
      },
    ]);
    const store = new PostgresApiKeyStore(db);
    const got = await store.listByInstallation('inst-1');
    expect(got).toHaveLength(2);
    expect(got[0].keyHash).toBe('a');
    expect(got[1].keyHash).toBe('b');
  });

  it('delete removes by keyHash', async () => {
    const db: any = chain(undefined);
    const store = new PostgresApiKeyStore(db);
    await store.delete('h');
    expect(db.delete).toHaveBeenCalledWith(apiKeys);
    expect(db.where).toHaveBeenCalled();
  });

  it('touchLastUsed sets lastUsedAt', async () => {
    const db: any = chain(undefined);
    const store = new PostgresApiKeyStore(db);
    await store.touchLastUsed('h', '2026-04-19T12:00:00.000Z');
    expect(db.update).toHaveBeenCalledWith(apiKeys);
    expect(db.set).toHaveBeenCalledWith({
      lastUsedAt: new Date('2026-04-19T12:00:00.000Z'),
    });
  });
});
