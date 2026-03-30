/**
 * Utility to filter files out of a unified diff string based on glob patterns.
 *
 * Used to respect `excludePatterns` and `rules.ignorePatterns` before sending
 * diffs to the review agents.
 */

import { minimatch } from 'minimatch';

/**
 * Split a unified diff string into per-file sections.
 * Each section starts with `diff --git a/... b/...`.
 */
function splitDiffByFile(diff: string): Array<{ file: string; section: string }> {
  const sections: Array<{ file: string; section: string }> = [];
  // Match diff headers like: diff --git a/path/to/file b/path/to/file
  const headerRegex = /^diff --git a\/(.+?) b\/(.+?)$/gm;

  let match: RegExpExecArray | null;
  const starts: Array<{ file: string; index: number }> = [];

  while ((match = headerRegex.exec(diff)) !== null) {
    starts.push({ file: match[2], index: match.index });
  }

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index;
    const end = i + 1 < starts.length ? starts[i + 1].index : diff.length;
    sections.push({
      file: starts[i].file,
      section: diff.slice(start, end),
    });
  }

  return sections;
}

/**
 * Filter a unified diff string, removing sections for files matching any of
 * the given glob patterns.
 *
 * Returns the filtered diff and the list of files that were excluded.
 */
export function filterDiff(
  diff: string,
  excludePatterns: string[],
): { filteredDiff: string; excludedFiles: string[] } {
  if (!excludePatterns.length || !diff) {
    return { filteredDiff: diff, excludedFiles: [] };
  }

  const sections = splitDiffByFile(diff);
  const excludedFiles: string[] = [];
  const kept: string[] = [];

  for (const { file, section } of sections) {
    const excluded = excludePatterns.some((pattern) => minimatch(file, pattern));
    if (excluded) {
      excludedFiles.push(file);
    } else {
      kept.push(section);
    }
  }

  return {
    filteredDiff: kept.join(''),
    excludedFiles,
  };
}
