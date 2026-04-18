/**
 * Computes the delta between two reviews of the same PR,
 * showing which issues were resolved, which are new, and which persist.
 */

export interface FindingLike {
  file: string;
  line: number;
  title: string;
}

export interface ReviewDelta {
  /** Number of issues from the previous review that are no longer present */
  resolvedCount: number;
  /** Number of new issues not in the previous review */
  newCount: number;
  /** Number of issues carried over unchanged from the previous review */
  carriedOverCount: number;
  /**
   * Findings from the previous review that are no longer reported — the
   * orchestrator either dropped them as resolved or the diff itself no
   * longer triggers them. Preserved here so the review comment can list
   * them in a collapsed "Previously reported" section for audit.
   */
  resolved: FindingLike[];
  /** New findings present on this commit but not in the previous review. */
  new: FindingLike[];
  /** Findings present in both the previous and current review. */
  carriedOver: FindingLike[];
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

  const prevByKey = new Map<string, FindingLike>();
  for (const f of previousFindings) prevByKey.set(findingKey(f), f);
  const currByKey = new Map<string, FindingLike>();
  for (const f of currentFindings) currByKey.set(findingKey(f), f);

  const resolved: FindingLike[] = [];
  for (const [key, f] of prevByKey) {
    if (!currByKey.has(key)) resolved.push(f);
  }

  const added: FindingLike[] = [];
  const carriedOver: FindingLike[] = [];
  for (const [key, f] of currByKey) {
    if (prevByKey.has(key)) {
      carriedOver.push(f);
    } else {
      added.push(f);
    }
  }

  return {
    resolvedCount: resolved.length,
    newCount: added.length,
    carriedOverCount: carriedOver.length,
    resolved,
    new: added,
    carriedOver,
  };
}
