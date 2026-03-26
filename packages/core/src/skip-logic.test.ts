import { describe, it, expect } from 'vitest';
import { shouldSkipPR, SKIP_PATTERNS } from './skip-logic.js';

describe('shouldSkipPR', () => {
  // ─── Empty input ──────────────────────────────────────────────────────────
  it('returns skip reason for empty file array', () => {
    const result = shouldSkipPR([]);
    expect(result).toBe('No changed files');
  });

  // ─── Single trivial files ────────────────────────────────────────────────
  it('skips a single doc file (README.md)', () => {
    const result = shouldSkipPR(['README.md']);
    expect(result).not.toBeNull();
    expect(result).toContain('docs');
  });

  it('skips a single lock file (package-lock.json)', () => {
    const result = shouldSkipPR(['package-lock.json']);
    expect(result).not.toBeNull();
    expect(result).toContain('lock files');
  });

  it('skips a single CI config file (.github/workflows/ci.yml)', () => {
    const result = shouldSkipPR(['.github/workflows/ci.yml']);
    expect(result).not.toBeNull();
    // .github/** is matched by SKIP_PATTERNS; categorization may vary
    expect(result).toMatch(/config|generated\/trivial/);
  });

  // ─── Non-trivial files ───────────────────────────────────────────────────
  it('returns null for a single source file (review needed)', () => {
    const result = shouldSkipPR(['src/index.ts']);
    expect(result).toBeNull();
  });

  it('returns null for a mix of doc + source files', () => {
    const result = shouldSkipPR(['README.md', 'src/index.ts']);
    expect(result).toBeNull();
  });

  // ─── Multiple trivial file types ─────────────────────────────────────────
  it('skips when only lock + docs files changed', () => {
    const result = shouldSkipPR(['package-lock.json', 'CHANGELOG.md']);
    expect(result).not.toBeNull();
    expect(result).toContain('lock files');
    expect(result).toContain('docs');
  });

  it('skips generated files (dist/bundle.js)', () => {
    const result = shouldSkipPR(['dist/bundle.js']);
    expect(result).not.toBeNull();
    expect(result).toContain('generated/trivial files');
  });

  it('skips .gitignore as a generated/trivial file', () => {
    const result = shouldSkipPR(['.gitignore']);
    expect(result).not.toBeNull();
  });

  it('skips config files (tsconfig.json)', () => {
    const result = shouldSkipPR(['tsconfig.json']);
    expect(result).not.toBeNull();
    expect(result).toContain('config');
  });

  it('skips prettierrc config files', () => {
    const result = shouldSkipPR(['.prettierrc.json']);
    expect(result).not.toBeNull();
    expect(result).toContain('config');
  });

  it('skips minified files (app.min.js)', () => {
    const result = shouldSkipPR(['assets/app.min.js']);
    expect(result).not.toBeNull();
  });

  it('skips multiple lock file types (yarn.lock, go.sum)', () => {
    const result = shouldSkipPR(['yarn.lock', 'go.sum']);
    expect(result).not.toBeNull();
    expect(result).toContain('lock files');
  });

  it('skips deep docs path (docs/api/reference.md)', () => {
    const result = shouldSkipPR(['docs/api/reference.md']);
    expect(result).not.toBeNull();
    expect(result).toContain('docs');
  });

  it('skips CHANGELOG files', () => {
    const result = shouldSkipPR(['CHANGELOG.md']);
    expect(result).not.toBeNull();
    expect(result).toContain('docs');
  });

  it('skips LICENSE files', () => {
    const result = shouldSkipPR(['LICENSE']);
    expect(result).not.toBeNull();
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────
  it('does not skip when at least one non-trivial file is present', () => {
    const result = shouldSkipPR([
      'package-lock.json',
      'README.md',
      '.github/workflows/ci.yml',
      'src/server.ts',
    ]);
    expect(result).toBeNull();
  });

  it('SKIP_PATTERNS array is exported and non-empty', () => {
    expect(SKIP_PATTERNS).toBeDefined();
    expect(SKIP_PATTERNS.length).toBeGreaterThan(0);
  });
});
