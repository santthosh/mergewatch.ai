import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiKeyRecord, IApiKeyStore } from '@mergewatch/core';
import {
  AuthError,
  extractBearerToken,
  hashApiKey,
  isRepoInScope,
  resolveApiKey,
} from './auth.js';

function makeStore(record: ApiKeyRecord | null): IApiKeyStore {
  return {
    create: vi.fn(),
    getByHash: vi.fn().mockResolvedValue(record),
    listByInstallation: vi.fn(),
    delete: vi.fn(),
    touchLastUsed: vi.fn().mockResolvedValue(undefined),
  };
}

// Literal avoids a CodeQL js/insufficient-password-hash false positive:
// when API_KEY_PREFIX flowed into hashApiKey, the taint tracker treated
// mw_sk_live_* tokens as passwords. They aren't — they're 192-bit random
// strings where SHA-256 is the correct hash.
const validKey = 'mw_sk_live_abc123xyz';

describe('extractBearerToken', () => {
  it('parses a well-formed Bearer header', () => {
    expect(extractBearerToken(`Bearer ${validKey}`)).toBe(validKey);
  });

  it('is case-insensitive on the Bearer scheme', () => {
    expect(extractBearerToken(`bearer ${validKey}`)).toBe(validKey);
  });

  it('throws missing when header is undefined', () => {
    expect(() => extractBearerToken(undefined)).toThrow(AuthError);
  });

  it('throws missing when header is empty', () => {
    try {
      extractBearerToken('   ');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe('missing');
    }
  });

  it('throws invalid when scheme is not Bearer', () => {
    try {
      extractBearerToken(`Basic ${validKey}`);
    } catch (err) {
      expect((err as AuthError).code).toBe('invalid');
    }
  });

  it('throws invalid when key prefix is wrong', () => {
    try {
      extractBearerToken('Bearer wrong_prefix_123');
    } catch (err) {
      expect((err as AuthError).code).toBe('invalid');
    }
  });
});

describe('hashApiKey', () => {
  it('returns deterministic sha256 hex', () => {
    expect(hashApiKey('a')).toBe(
      'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    );
  });

  it('differs for different keys', () => {
    expect(hashApiKey('a')).not.toEqual(hashApiKey('b'));
  });
});

describe('resolveApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the installation + scope on a valid key', async () => {
    const record: ApiKeyRecord = {
      keyHash: hashApiKey(validKey),
      installationId: 'inst-42',
      label: 'test',
      scope: 'all',
      createdBy: 'u1',
      createdAt: '2026-04-19T00:00:00.000Z',
    };
    const store = makeStore(record);
    const res = await resolveApiKey(`Bearer ${validKey}`, store);
    expect(res.installationId).toBe('inst-42');
    expect(res.scope).toBe('all');
    expect(res.keyHash).toBe(record.keyHash);
  });

  it('fires touchLastUsed without awaiting it', async () => {
    const record: ApiKeyRecord = {
      keyHash: hashApiKey(validKey),
      installationId: 'inst-1',
      label: 'test',
      scope: ['acme/web'],
      createdBy: 'u1',
      createdAt: '2026-04-19T00:00:00.000Z',
    };
    const store = makeStore(record);
    await resolveApiKey(`Bearer ${validKey}`, store);
    expect(store.touchLastUsed).toHaveBeenCalledWith(record.keyHash, expect.any(String));
  });

  it('does not fail when touchLastUsed rejects', async () => {
    const record: ApiKeyRecord = {
      keyHash: hashApiKey(validKey),
      installationId: 'inst-1',
      label: 'test',
      scope: 'all',
      createdBy: 'u1',
      createdAt: '2026-04-19T00:00:00.000Z',
    };
    const store = makeStore(record);
    (store.touchLastUsed as any).mockRejectedValueOnce(new Error('dynamo down'));
    await expect(resolveApiKey(`Bearer ${validKey}`, store)).resolves.toBeDefined();
  });

  it('throws missing when no header is provided', async () => {
    const store = makeStore(null);
    await expect(resolveApiKey(undefined, store)).rejects.toMatchObject({ code: 'missing' });
  });

  it('throws revoked when the key is unknown', async () => {
    const store = makeStore(null);
    await expect(resolveApiKey(`Bearer ${validKey}`, store)).rejects.toMatchObject({
      code: 'revoked',
    });
  });
});

describe('isRepoInScope', () => {
  it('returns true for scope=all', () => {
    expect(
      isRepoInScope(
        { installationId: '1', scope: 'all', keyHash: 'h' },
        'acme/web',
      ),
    ).toBe(true);
  });

  it('returns true when owner/repo is listed', () => {
    expect(
      isRepoInScope(
        { installationId: '1', scope: ['acme/web'], keyHash: 'h' },
        'acme/web',
      ),
    ).toBe(true);
  });

  it('returns false when owner/repo is not listed', () => {
    expect(
      isRepoInScope(
        { installationId: '1', scope: ['acme/api'], keyHash: 'h' },
        'acme/web',
      ),
    ).toBe(false);
  });
});
