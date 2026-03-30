import { describe, it, expect } from 'vitest';
import { filterDiff } from './diff-filter.js';

const makeDiff = (...files: string[]) =>
  files
    .map(
      (f) =>
        `diff --git a/${f} b/${f}\nindex abc..def 100644\n--- a/${f}\n+++ b/${f}\n@@ -1,3 +1,4 @@\n+added line\n`,
    )
    .join('');

describe('filterDiff', () => {
  it('returns the diff unchanged when excludePatterns is empty', () => {
    const diff = makeDiff('src/index.ts');
    const { filteredDiff, excludedFiles } = filterDiff(diff, []);
    expect(filteredDiff).toBe(diff);
    expect(excludedFiles).toEqual([]);
  });

  it('returns the diff unchanged when diff is empty', () => {
    const { filteredDiff, excludedFiles } = filterDiff('', ['**/*.lock']);
    expect(filteredDiff).toBe('');
    expect(excludedFiles).toEqual([]);
  });

  it('excludes files matching a glob pattern', () => {
    const diff = makeDiff('src/index.ts', 'package-lock.json');
    const { filteredDiff, excludedFiles } = filterDiff(diff, ['package-lock.json']);
    expect(excludedFiles).toEqual(['package-lock.json']);
    expect(filteredDiff).toContain('src/index.ts');
    expect(filteredDiff).not.toContain('package-lock.json');
  });

  it('excludes files matching wildcard patterns', () => {
    const diff = makeDiff('src/app.ts', 'yarn.lock', 'pnpm-lock.yaml');
    const { filteredDiff, excludedFiles } = filterDiff(diff, ['*.lock', '*.yaml']);
    expect(excludedFiles).toEqual(['yarn.lock', 'pnpm-lock.yaml']);
    expect(filteredDiff).toContain('src/app.ts');
  });

  it('excludes files matching glob star patterns', () => {
    const diff = makeDiff('src/index.ts', 'dist/bundle.js', 'dist/styles.css');
    const { filteredDiff, excludedFiles } = filterDiff(diff, ['dist/**']);
    expect(excludedFiles).toEqual(['dist/bundle.js', 'dist/styles.css']);
    expect(filteredDiff).toContain('src/index.ts');
  });

  it('excludes all files when all match', () => {
    const diff = makeDiff('package-lock.json', 'yarn.lock');
    const { filteredDiff, excludedFiles } = filterDiff(diff, ['*.lock', 'package-lock.json']);
    expect(excludedFiles).toEqual(['package-lock.json', 'yarn.lock']);
    expect(filteredDiff).toBe('');
  });

  it('keeps all files when none match', () => {
    const diff = makeDiff('src/index.ts', 'src/utils.ts');
    const { filteredDiff, excludedFiles } = filterDiff(diff, ['*.lock']);
    expect(excludedFiles).toEqual([]);
    expect(filteredDiff).toBe(diff);
  });

  it('works correctly when called multiple times (regex lastIndex reset)', () => {
    const diff = makeDiff('src/index.ts', 'dist/out.js');
    const result1 = filterDiff(diff, ['dist/**']);
    const result2 = filterDiff(diff, ['dist/**']);
    expect(result1.excludedFiles).toEqual(['dist/out.js']);
    expect(result2.excludedFiles).toEqual(['dist/out.js']);
    expect(result1.filteredDiff).toBe(result2.filteredDiff);
  });
});
