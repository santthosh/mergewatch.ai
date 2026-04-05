import { describe, it, expect } from 'vitest';
import { fetchFileContents } from './file-fetcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockOctokit(files: Record<string, string>) {
  return {
    repos: {
      getContent: async ({ path }: { owner: string; repo: string; path: string; ref: string }) => {
        const content = files[path];
        if (!content) throw new Error(`File not found: ${path}`);
        return {
          data: {
            type: 'file',
            content: Buffer.from(content).toString('base64'),
            encoding: 'base64',
          },
        };
      },
    },
  } as any;
}

// ---------------------------------------------------------------------------
// fetchFileContents
// ---------------------------------------------------------------------------

describe('fetchFileContents', () => {
  it('returns empty object for empty file list', async () => {
    const octokit = createMockOctokit({});
    const result = await fetchFileContents(octokit, 'o', 'r', 'ref', []);
    expect(result).toEqual({});
  });

  it('fetches file contents and returns them keyed by path', async () => {
    const octokit = createMockOctokit({
      'src/index.ts': 'const a = 1;',
      'src/utils.ts': 'export const b = 2;',
    });
    const result = await fetchFileContents(octokit, 'o', 'r', 'ref', ['src/index.ts', 'src/utils.ts']);
    expect(result['src/index.ts']).toBe('const a = 1;');
    expect(result['src/utils.ts']).toBe('export const b = 2;');
  });

  it('skips binary files', async () => {
    const octokit = createMockOctokit({
      'logo.png': 'binary content',
      'doc.pdf': 'binary content',
      'src/index.ts': 'code',
    });
    const result = await fetchFileContents(octokit, 'o', 'r', 'ref', [
      'logo.png', 'doc.pdf', 'src/index.ts',
    ]);
    expect(result).toEqual({ 'src/index.ts': 'code' });
  });

  it('skips files that return 404', async () => {
    const octokit = createMockOctokit({
      'src/exists.ts': 'found',
      // 'src/missing.ts' not in the map → throws
    });
    const result = await fetchFileContents(octokit, 'o', 'r', 'ref', [
      'src/missing.ts', 'src/exists.ts',
    ]);
    expect(result).toEqual({ 'src/exists.ts': 'found' });
  });

  it('skips directory responses', async () => {
    const octokit = {
      repos: {
        getContent: async () => ({
          data: [{ type: 'dir', name: 'subdir' }], // array = directory listing
        }),
      },
    } as any;
    const result = await fetchFileContents(octokit, 'o', 'r', 'ref', ['src/']);
    expect(result).toEqual({});
  });

  it('enforces budget and truncates the last file', async () => {
    // Each file is 600 bytes; budget is 1 KB
    const content600 = 'x'.repeat(600);
    const octokit = createMockOctokit({
      'a.ts': content600,
      'b.ts': content600,
      'c.ts': content600,
    });
    const result = await fetchFileContents(octokit, 'o', 'r', 'ref', ['a.ts', 'b.ts', 'c.ts'], 1);

    // First file: 600 bytes (fits)
    expect(result['a.ts']).toBe(content600);
    // Second file: 600 bytes would exceed 1024, so truncated to remaining 424 bytes
    expect(result['b.ts']).toContain('... (truncated)');
    expect(result['b.ts'].length).toBeLessThan(600);
    // Third file: budget exhausted, not fetched
    expect(result['c.ts']).toBeUndefined();
  });

  it('stops fetching once budget is fully spent', async () => {
    const content1024 = 'y'.repeat(1024);
    const octokit = createMockOctokit({
      'big.ts': content1024,
      'small.ts': 'tiny',
    });
    const result = await fetchFileContents(octokit, 'o', 'r', 'ref', ['big.ts', 'small.ts'], 1);

    expect(result['big.ts']).toBe(content1024);
    expect(result['small.ts']).toBeUndefined();
  });
});
