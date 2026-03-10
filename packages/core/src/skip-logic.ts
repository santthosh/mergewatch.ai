/**
 * Smart skip logic for MergeWatch.
 *
 * Determines whether a PR should be skipped because all changed files
 * are trivial (docs-only, lock files, config, etc.). This avoids
 * unnecessary Bedrock costs on PRs that don't need AI review.
 *
 * Deployment-agnostic — no AWS or platform-specific dependencies.
 */

import { minimatch } from 'minimatch';

/**
 * File patterns that indicate a trivial PR not worth reviewing.
 * If ALL changed files match these patterns, the PR is skipped.
 */
export const SKIP_PATTERNS = [
  // Lock files and dependency manifests
  '**/*.lock',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/Gemfile.lock',
  '**/Pipfile.lock',
  '**/poetry.lock',
  '**/composer.lock',
  '**/go.sum',
  // Documentation
  '**/*.md',
  '**/*.mdx',
  '**/*.txt',
  '**/*.rst',
  '**/docs/**',
  '**/CHANGELOG*',
  '**/CHANGES*',
  '**/LICENSE*',
  '**/NOTICE*',
  // Generated / build artifacts
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/dist/**',
  '**/build/**',
  '**/node_modules/**',
  '**/.gitignore',
  '**/.gitattributes',
  // Config-only files (version bumps, CI tweaks)
  '**/.github/**',
  '**/.vscode/**',
  '**/.idea/**',
  '**/.editorconfig',
  '**/.eslintignore',
  '**/.prettierignore',
  '**/.prettierrc*',
  '**/.eslintrc*',
  '**/tsconfig.json',
  '**/renovate.json',
  '**/.renovaterc*',
];

/**
 * Check if a PR should be skipped because all changed files are trivial.
 * Returns a skip reason string if skipped, or null if the PR should be reviewed.
 */
export function shouldSkipPR(files: string[]): string | null {
  if (files.length === 0) return 'No changed files';

  const nonTrivialFiles = files.filter(
    (file) => !SKIP_PATTERNS.some((pattern) => minimatch(file, pattern)),
  );

  if (nonTrivialFiles.length === 0) {
    // Categorize what the PR contains for the skip reason
    const hasLockFiles = files.some((f) => /\.lock$|lock\.json$|lock\.yaml$|go\.sum$/.test(f));
    const hasDocs = files.some((f) => /\.(md|mdx|txt|rst)$/i.test(f) || /docs\//i.test(f));
    const hasConfig = files.some((f) => /^\.|tsconfig|renovate|eslint|prettier/i.test(f.split('/').pop() ?? ''));

    const reasons: string[] = [];
    if (hasLockFiles) reasons.push('lock files');
    if (hasDocs) reasons.push('docs');
    if (hasConfig) reasons.push('config');
    if (reasons.length === 0) reasons.push('generated/trivial files');

    return `Only ${reasons.join(' + ')} changed`;
  }

  return null;
}
