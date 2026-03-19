/**
 * Computes the delta between two reviews of the same PR,
 * showing which issues were resolved, which are new, and which persist.
 */

export interface ReviewDelta {
  /** Number of issues from the previous review that are no longer present */
  resolvedCount: number;
  /** Number of new issues not in the previous review */
  newCount: number;
  /** Number of issues carried over unchanged from the previous review */
  carriedOverCount: number;
}

interface FindingLike {
  file: string;
  line: number;
  title: string;
}

/**
 * Build a fingerprint key for a finding based on file + title.
 * We intentionally exclude line number since lines shift between commits.
 */
function findingKey(f: FindingLike): string {
  return `${f.file}::${f.title}`;
}

/**
 * Compute the delta between current findings and previous findings.
 * Returns null if there are no previous findings to compare against.
 */
export function computeReviewDelta(
  currentFindings: FindingLike[],
  previousFindings: FindingLike[] | undefined | null,
): ReviewDelta | null {
  if (!previousFindings || previousFindings.length === 0) {
    return null;
  }

  const prevKeys = new Set(previousFindings.map(findingKey));
  const currKeys = new Set(currentFindings.map(findingKey));

  let resolvedCount = 0;
  for (const key of prevKeys) {
    if (!currKeys.has(key)) resolvedCount++;
  }

  let newCount = 0;
  for (const key of currKeys) {
    if (!prevKeys.has(key)) newCount++;
  }

  const carriedOverCount = currentFindings.length - newCount;

  return { resolvedCount, newCount, carriedOverCount };
}
