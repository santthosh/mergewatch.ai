import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchConventions = vi.fn();

vi.mock('@mergewatch/core', async () => {
  const actual = await vi.importActual<typeof import('@mergewatch/core')>('@mergewatch/core');
  return {
    ...actual,
    fetchConventions: (...args: unknown[]) => fetchConventions(...args),
  };
});

import {
  CONVENTIONS_URI_PREFIX,
  handleConventionsResource,
  parseConventionsUri,
} from './conventions.js';
import type { McpServerDeps } from '../server-deps.js';
import type { AuthResolution } from '../middleware/auth.js';

describe('parseConventionsUri', () => {
  it('parses a valid URI', () => {
    expect(parseConventionsUri(`${CONVENTIONS_URI_PREFIX}acme/web`)).toEqual({
      owner: 'acme',
      repo: 'web',
    });
  });

  it('returns null for the wrong scheme', () => {
    expect(parseConventionsUri('http://acme/web')).toBeNull();
  });

  it('returns null for missing parts', () => {
    expect(parseConventionsUri(`${CONVENTIONS_URI_PREFIX}acme`)).toBeNull();
    expect(parseConventionsUri(`${CONVENTIONS_URI_PREFIX}`)).toBeNull();
    expect(parseConventionsUri(`${CONVENTIONS_URI_PREFIX}a/b/c`)).toBeNull();
  });
});

function makeDeps(): McpServerDeps {
  return {
    llm: {} as any,
    authProvider: {
      getInstallationOctokit: vi.fn().mockResolvedValue({} as any),
    },
    installationStore: {} as any,
    reviewStore: {} as any,
    apiKeyStore: {} as any,
    sessionStore: {} as any,
    billing: { check: vi.fn(), record: vi.fn() } as any,
    ddbClient: {} as any,
    installationsTable: 'installations',
  };
}

const auth: AuthResolution = { installationId: '1', scope: 'all', keyHash: 'h' };

describe('handleConventionsResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the conventions text when found', async () => {
    fetchConventions.mockResolvedValueOnce({
      content: '# conventions',
      sourcePath: 'AGENTS.md',
      truncated: false,
    });
    const deps = makeDeps();
    const out = await handleConventionsResource(
      `${CONVENTIONS_URI_PREFIX}acme/web`,
      deps,
      auth,
    );
    expect(out.found).toBe(true);
    expect(out.text).toBe('# conventions');
    expect(out.sourcePath).toBe('AGENTS.md');
    expect(out.truncated).toBe(false);
  });

  it('returns found=false when no conventions file exists', async () => {
    fetchConventions.mockResolvedValueOnce(null);
    const deps = makeDeps();
    const out = await handleConventionsResource(
      `${CONVENTIONS_URI_PREFIX}acme/web`,
      deps,
      auth,
    );
    expect(out.found).toBe(false);
    expect(out.text).toBe('');
  });

  it('returns found=false when fetchConventions throws', async () => {
    fetchConventions.mockRejectedValueOnce(new Error('boom'));
    const deps = makeDeps();
    const out = await handleConventionsResource(
      `${CONVENTIONS_URI_PREFIX}acme/web`,
      deps,
      auth,
    );
    expect(out.found).toBe(false);
  });

  it('rejects a malformed URI', async () => {
    const deps = makeDeps();
    await expect(
      handleConventionsResource('https://x/y', deps, auth),
    ).rejects.toThrow(/Invalid/);
  });

  it('rejects out-of-scope repos', async () => {
    const deps = makeDeps();
    await expect(
      handleConventionsResource(
        `${CONVENTIONS_URI_PREFIX}other/repo`,
        deps,
        { installationId: '1', scope: ['acme/web'], keyHash: 'h' },
      ),
    ).rejects.toThrow(/scope/);
  });
});
