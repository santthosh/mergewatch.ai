/**
 * Formats the final GitHub PR comment from orchestrated review findings.
 *
 * The comment uses a hidden HTML marker (<!-- mergewatch-review -->) so the
 * handler can find and update an existing comment instead of posting duplicates.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Finding {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'info';
  confidence?: number;
  category: string;
  title: string;
  description: string;
  suggestion: string;
}

interface FormatOptions {
  /** Markdown summary text from the summary agent */
  summary: string;
  /** Deduplicated + ranked findings from the orchestrator */
  findings: Finding[];
  /** Optional custom footer line from installation settings */
  commentFooter?: string;
  /** Whether to show the summary section */
  showSummary?: boolean;
  /** Whether to show the issues table */
  showIssuesTable?: boolean;
  /** Whether to show confidence scores per finding */
  showConfidence?: boolean;
  /** Mermaid diagram code from the diagram agent */
  diagram?: string;
  /** Caption for the diagram */
  diagramCaption?: string;
  /** Whether to show the diagram section */
  showDiagram?: boolean;
  /** URL to the review detail page on the MergeWatch dashboard */
  reviewDetailUrl?: string;
  /** Overall merge readiness score (1-5) */
  mergeScore?: number;
  /** One-line reason for the merge score */
  mergeScoreReason?: string;
}

// ─── Severity display config ───────────────────────────────────────────────

const SEVERITY_META: Record<Finding['severity'], { emoji: string; label: string; order: number }> = {
  critical: { emoji: '\uD83D\uDD34', label: 'Critical', order: 0 },
  warning:  { emoji: '\uD83D\uDFE1', label: 'Warnings', order: 1 },
  info:     { emoji: '\uD83D\uDD35', label: 'Info',     order: 2 },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const MERGE_SCORE_META: Record<number, { emoji: string; label: string }> = {
  5: { emoji: '\uD83D\uDFE2', label: 'Safe to merge' },
  4: { emoji: '\uD83D\uDFE2', label: 'Generally safe' },
  3: { emoji: '\uD83D\uDFE1', label: 'Review recommended' },
  2: { emoji: '\uD83D\uDFE0', label: 'Needs fixes' },
  1: { emoji: '\uD83D\uDD34', label: 'Do not merge' },
};

/** Render the merge score as a prominent badge line. */
function renderMergeScore(score: number): string {
  const clamped = Math.max(1, Math.min(5, score));
  const { emoji, label } = MERGE_SCORE_META[clamped];
  return `${emoji} **${clamped}/5 — ${label}**`;
}

/** Group findings by severity, preserving intra-group order. */
function groupBySeverity(findings: Finding[]): Map<Finding['severity'], Finding[]> {
  const groups = new Map<Finding['severity'], Finding[]>();
  for (const f of findings) {
    const list = groups.get(f.severity) ?? [];
    list.push(f);
    groups.set(f.severity, list);
  }
  return groups;
}

/** Render a single finding as a markdown list item. */
function renderFinding(f: Finding, showConfidence: boolean): string {
  const confidenceBadge = showConfidence && f.confidence != null
    ? ` \`${f.confidence}%\``
    : '';
  let line = `- **\`${f.file}:${f.line}\`** — ${f.title}${confidenceBadge}`;
  if (f.description) {
    line += `\n  ${f.description}`;
  }
  if (f.suggestion) {
    line += `\n  > **Suggestion:** ${f.suggestion}`;
  }
  return line;
}

// ─── Main formatter ────────────────────────────────────────────────────────

/**
 * Build the full markdown comment body for a MergeWatch review.
 *
 * @returns A markdown string ready to be posted as a GitHub PR comment.
 */
export function formatReviewComment(options: FormatOptions): string {
  const {
    summary,
    findings,
    commentFooter,
    showSummary = true,
    showIssuesTable = true,
    showConfidence = true,
    diagram,
    diagramCaption,
    showDiagram = true,
    reviewDetailUrl,
    mergeScore,
    mergeScoreReason,
  } = options;

  const lines: string[] = [];

  // Note: the hidden marker (<!-- mergewatch-review -->) is prepended by
  // postReviewComment / updateReviewComment in github/client.ts — not here.

  // Header — logo wordmark
  lines.push('<img src="https://raw.githubusercontent.com/santthosh/mergewatch.ai/main/assets/wordmark-fit.png" alt="mergewatch" height="16" />');
  lines.push('');

  // Merge readiness score — highly visible
  if (mergeScore != null) {
    const scoreDisplay = renderMergeScore(mergeScore);
    const reasonSuffix = mergeScoreReason ? ` — ${mergeScoreReason}` : '';
    lines.push(`> ${scoreDisplay}${reasonSuffix}`);
    lines.push('');
  }

  // Summary (collapsible)
  if (summary && showSummary) {
    lines.push('<details><summary>Summary</summary>');
    lines.push('');
    lines.push(summary);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Diagram (collapsible)
  if (diagram && showDiagram) {
    const captionText = diagramCaption ? ` — ${diagramCaption}` : '';
    lines.push(`<details><summary>Diagram${captionText}</summary>`);
    lines.push('');
    lines.push('```mermaid');
    lines.push(diagram);
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Findings grouped by severity
  if (findings.length === 0) {
    lines.push('No issues found — looking good! \u2705');
  } else if (!showIssuesTable) {
    lines.push(`${findings.length} issue${findings.length !== 1 ? 's' : ''} found.`);
  } else {
    const grouped = groupBySeverity(findings);

    // Sort severity groups in critical → warning → info order
    const sortedSeverities = ([...grouped.entries()] as [Finding['severity'], Finding[]][])
      .sort(([a], [b]) => SEVERITY_META[a].order - SEVERITY_META[b].order);

    for (const [severity, items] of sortedSeverities) {
      const { emoji, label } = SEVERITY_META[severity];
      lines.push(`### ${emoji} ${label} (${items.length})`);
      for (const item of items) {
        lines.push(renderFinding(item, showConfidence));
      }
      lines.push('');
    }
  }

  // Footer
  const footerParts: string[] = [];
  if (reviewDetailUrl) {
    footerParts.push(`[View full details](${reviewDetailUrl})`);
  }
  if (commentFooter) {
    footerParts.push(commentFooter);
  }
  if (footerParts.length > 0) {
    lines.push('---');
    lines.push(footerParts.join(' · '));
  }

  return lines.join('\n');
}
