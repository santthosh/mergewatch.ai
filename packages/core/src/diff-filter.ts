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
  // Match the full diff header line — single .+ avoids polynomial backtracking
  // that two lazy (.+?) groups would cause when paths contain spaces.
  const headerRegex = /^diff --git a\/(.+)$/gm;

  let match: RegExpExecArray | null;
  const starts: Array<{ file: string; index: number }> = [];
  headerRegex.lastIndex = 0;

  while ((match = headerRegex.exec(diff)) !== null) {
    // The captured group is "<path1> b/<path2>". Extract the b/ path.
    const rest = match[1];
    const sepIdx = rest.indexOf(' b/');
    const file = sepIdx !== -1 ? rest.slice(sepIdx + 3) : rest;
    starts.push({ file, index: match.index });
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
