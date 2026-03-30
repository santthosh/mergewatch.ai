import { describe, it, expect } from 'vitest';
import { shouldSkipPR, shouldSkipByRules, SKIP_PATTERNS } from './skip-logic.js';
import { DEFAULT_RULES_CONFIG } from './config/defaults.js';
import type { RulesConfig } from './config/defaults.js';

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

describe('shouldSkipByRules', () => {
  const defaults: RulesConfig = { ...DEFAULT_RULES_CONFIG };

  // ─── skipDrafts ───────────────────────────────────────────────────────────
  it('skips draft PRs when skipDrafts is true (default)', () => {
    const result = shouldSkipByRules(defaults, { isDraft: true });
    expect(result).not.toBeNull();
    expect(result).toContain('Draft PR');
  });

  it('does not skip draft PRs when skipDrafts is false', () => {
    const result = shouldSkipByRules({ ...defaults, skipDrafts: false }, { isDraft: true });
    expect(result).toBeNull();
  });

  it('does not skip non-draft PRs regardless of skipDrafts', () => {
    expect(shouldSkipByRules(defaults, { isDraft: false })).toBeNull();
    expect(shouldSkipByRules(defaults, {})).toBeNull();
  });

  // ─── maxFiles ─────────────────────────────────────────────────────────────
  it('skips PRs exceeding maxFiles', () => {
    const result = shouldSkipByRules({ ...defaults, maxFiles: 10 }, { changedFileCount: 15 });
    expect(result).not.toBeNull();
    expect(result).toContain('15');
    expect(result).toContain('max: 10');
  });

  it('does not skip PRs at or below maxFiles', () => {
    expect(shouldSkipByRules({ ...defaults, maxFiles: 10 }, { changedFileCount: 10 })).toBeNull();
    expect(shouldSkipByRules({ ...defaults, maxFiles: 10 }, { changedFileCount: 5 })).toBeNull();
  });

  it('does not skip when changedFileCount is undefined', () => {
    expect(shouldSkipByRules({ ...defaults, maxFiles: 10 }, {})).toBeNull();
  });

  // ─── ignoreLabels ────────────────────────────────────────────────────────
  it('skips PRs with a matching ignore label', () => {
    const result = shouldSkipByRules(defaults, { labels: ['skip-review'] });
    expect(result).not.toBeNull();
    expect(result).toContain('skip-review');
  });

  it('matches labels case-insensitively', () => {
    const result = shouldSkipByRules(
      { ...defaults, ignoreLabels: ['WIP'] },
      { labels: ['wip'] },
    );
    expect(result).not.toBeNull();
    expect(result).toContain('wip');
  });

  it('does not skip when no labels match', () => {
    const result = shouldSkipByRules(defaults, { labels: ['enhancement', 'bug'] });
    expect(result).toBeNull();
  });

  it('does not skip when PR has no labels', () => {
    expect(shouldSkipByRules(defaults, { labels: [] })).toBeNull();
    expect(shouldSkipByRules(defaults, {})).toBeNull();
  });

  it('does not skip when ignoreLabels is empty', () => {
    const result = shouldSkipByRules(
      { ...defaults, ignoreLabels: [] },
      { labels: ['skip-review'] },
    );
    expect(result).toBeNull();
  });

  // ─── autoReview ──────────────────────────────────────────────────────────
  it('skips auto-triggered reviews when autoReview is false', () => {
    const result = shouldSkipByRules({ ...defaults, autoReview: false }, { mode: 'review' });
    expect(result).not.toBeNull();
    expect(result).toContain('Automatic reviews disabled');
  });

  it('does not skip mention-triggered reviews when autoReview is false', () => {
    expect(shouldSkipByRules({ ...defaults, autoReview: false }, { mode: 'summary' })).toBeNull();
    expect(shouldSkipByRules({ ...defaults, autoReview: false }, { mode: 'respond' })).toBeNull();
  });

  // ─── reviewOnMention ─────────────────────────────────────────────────────
  it('skips mention-triggered reviews when reviewOnMention is false', () => {
    const result = shouldSkipByRules({ ...defaults, reviewOnMention: false }, { mode: 'summary' });
    expect(result).not.toBeNull();
    expect(result).toContain('Mention-triggered reviews disabled');
  });

  it('skips respond mode when reviewOnMention is false', () => {
    const result = shouldSkipByRules({ ...defaults, reviewOnMention: false }, { mode: 'respond' });
    expect(result).not.toBeNull();
  });

  it('does not skip auto-triggered reviews when reviewOnMention is false', () => {
    const result = shouldSkipByRules({ ...defaults, reviewOnMention: false }, { mode: 'review' });
    expect(result).toBeNull();
  });

  // ─── Combined rules ──────────────────────────────────────────────────────
  it('returns first matching rule (autoReview checked before skipDrafts)', () => {
    const result = shouldSkipByRules(
      { ...defaults, autoReview: false },
      { isDraft: true, mode: 'review' },
    );
    expect(result).toContain('Automatic reviews disabled');
  });

  it('returns null when all rules pass', () => {
    const result = shouldSkipByRules(defaults, {
      isDraft: false,
      labels: ['enhancement'],
      changedFileCount: 5,
      mode: 'review',
    });
    expect(result).toBeNull();
  });
});
