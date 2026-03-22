/**
 * Formats the final GitHub PR comment from orchestrated review findings.
 *
 * The comment uses a hidden HTML marker (<!-- mergewatch-review -->) so the
 * handler can find and update an existing comment instead of posting duplicates.
 */

import type { UXConfig } from './config/defaults.js';
import type { ReviewDelta } from './review-delta.js';

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

export interface WorkDoneSection {
  filesScanned: number;
  linesScanned: number;
  agentsRan: number;
  hasDependencyFiles: boolean;
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
  /** UX configuration */
  ux?: UXConfig;
  /** Work done stats for the work-done section */
  workDone?: WorkDoneSection;
  /** Delta from previous review (null if first review) */
  delta?: ReviewDelta | null;
  /** Number of findings suppressed by orchestrator */
  suppressedCount?: number;
  /** Number of enabled agents that ran */
  enabledAgentCount?: number;
  /** Total input tokens used */
  inputTokens?: number;
  /** Total output tokens used */
  outputTokens?: number;
  /** Estimated cost in USD */
  estimatedCostUsd?: number | null;
}

/** Maximum number of findings to include in the reviewer checklist. */
const MAX_CHECKLIST_ITEMS = 5;

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

const DEPENDENCY_FILE_PATTERNS = [
  /package\.json$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /Gemfile\.lock$/,
  /Cargo\.lock$/,
  /go\.sum$/,
  /requirements\.txt$/,
  /poetry\.lock$/,
];

/** Build work-done section data from PR context file stats. */
export function buildWorkDoneSection(
  files: string[],
  totalAdditions: number,
  totalDeletions: number,
  enabledAgentCount: number,
): WorkDoneSection {
  const hasDependencyFiles = files.some((f) =>
    DEPENDENCY_FILE_PATTERNS.some((p) => p.test(f)),
  );

  return {
    filesScanned: files.length,
    linesScanned: totalAdditions + totalDeletions,
    agentsRan: enabledAgentCount,
    hasDependencyFiles,
  };
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
    ux,
    workDone,
    delta,
    suppressedCount,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
  } = options;

  const lines: string[] = [];

  // Note: the hidden marker (<!-- mergewatch-review -->) is prepended by
  // postReviewComment / updateReviewComment in github/client.ts — not here.

  // 1. Header — custom or default logo wordmark
  if (ux?.commentHeader) {
    lines.push(ux.commentHeader);
  } else {
    lines.push('<img src="https://raw.githubusercontent.com/santthosh/mergewatch.ai/main/assets/wordmark-fit.png" alt="mergewatch" height="16" />');
  }
  lines.push('');

  // 2. Work Done section
  if (workDone && (ux?.showWorkDone !== false)) {
    const parts: string[] = [
      `**${workDone.filesScanned}** file${workDone.filesScanned !== 1 ? 's' : ''} scanned`,
      `**${workDone.linesScanned.toLocaleString()}** lines reviewed`,
      `**${workDone.agentsRan}** specialized agent${workDone.agentsRan !== 1 ? 's' : ''} ran`,
    ];
    if (workDone.hasDependencyFiles) {
      parts.push('dependency files detected');
    }
    lines.push(`> ${parts.join(' \u00B7 ')}`);
    lines.push('');
  }

  // 3. Delta strip (re-review progress)
  if (delta) {
    const deltaParts: string[] = [];
    if (delta.resolvedCount > 0) {
      deltaParts.push(`\u2705 **${delta.resolvedCount}** resolved`);
    }
    if (delta.newCount > 0) {
      deltaParts.push(`\uD83C\uDD95 **${delta.newCount}** new`);
    }
    if (delta.carriedOverCount > 0) {
      deltaParts.push(`\u27A1\uFE0F **${delta.carriedOverCount}** carried over`);
    }
    if (deltaParts.length > 0) {
      lines.push(`> ${deltaParts.join(' \u00B7 ')}`);
      lines.push('');
    }
  }

  // 4. Merge readiness score — highly visible
  if (mergeScore != null) {
    const scoreDisplay = renderMergeScore(mergeScore);
    const reasonSuffix = mergeScoreReason ? ` \u2014 ${mergeScoreReason}` : '';
    lines.push(`> ${scoreDisplay}${reasonSuffix}`);
    lines.push('');
  }

  // 5. Summary (collapsible)
  if (summary && showSummary) {
    lines.push('<details><summary>Summary</summary>');
    lines.push('');
    lines.push(summary);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // 6. Diagram
  if (diagram && showDiagram) {
    const captionText = diagramCaption ? `**Diagram** \u2014 ${diagramCaption}` : '**Diagram**';
    lines.push(captionText);
    lines.push('');
    lines.push('```mermaid');
    lines.push(diagram);
    lines.push('```');
    lines.push('');
  }

  // 7. Findings OR All Clear message
  if (findings.length === 0) {
    if (ux?.allClearMessage !== false) {
      lines.push('\uD83C\uDF89 **All clear!** No issues found \u2014 this PR looks good to go.');
      lines.push('');
    } else {
      lines.push('No issues found \u2014 looking good! \u2705');
    }
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

  // 8. Suppressed count (collapsible)
  if (suppressedCount && suppressedCount > 0 && (ux?.showSuppressedCount !== false)) {
    lines.push(`<details><summary>${suppressedCount} additional finding${suppressedCount !== 1 ? 's' : ''} suppressed by deduplication and quality filters</summary>`);
    lines.push('');
    lines.push('The orchestrator removed duplicate findings and those below the confidence threshold to keep the review focused on high-signal issues.');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // 9. Reviewer checklist (derived from top critical/warning findings)
  if (ux?.reviewerChecklist !== false && findings.length > 0) {
    const checklistFindings = findings
      .filter((f) => f.severity === 'critical' || f.severity === 'warning')
      .slice(0, MAX_CHECKLIST_ITEMS);

    if (checklistFindings.length > 0) {
      lines.push('<details><summary>Reviewer checklist</summary>');
      lines.push('');
      for (const f of checklistFindings) {
        lines.push(`- [ ] ${f.title} (\`${f.file}:${f.line}\`)`);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  // 10. LLM cost (collapsible)
  const totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0);
  if (totalTokens > 0) {
    const costLine = estimatedCostUsd != null && estimatedCostUsd > 0
      ? ` · ~$${estimatedCostUsd.toFixed(4)} estimated cost (LLM only)`
      : '';
    lines.push(`<details><summary>LLM usage: ${totalTokens.toLocaleString()} tokens${costLine}</summary>`);
    lines.push('');
    lines.push(`- **Input tokens:** ${(inputTokens ?? 0).toLocaleString()}`);
    lines.push(`- **Output tokens:** ${(outputTokens ?? 0).toLocaleString()}`);
    if (estimatedCostUsd != null && estimatedCostUsd > 0) {
      lines.push(`- **Estimated cost:** ~$${estimatedCostUsd.toFixed(4)} (LLM only)`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // 11. Deference footer
  lines.push('---');
  lines.push('*These are flags, not verdicts. You know this codebase.*');
  lines.push('');

  // 11. Dashboard link + custom footer
  const footerParts: string[] = [];
  if (reviewDetailUrl) {
    footerParts.push(`[View full details](${reviewDetailUrl})`);
  }
  if (commentFooter) {
    footerParts.push(commentFooter);
  }
  if (footerParts.length > 0) {
    lines.push(footerParts.join(' \u00B7 '));
  }

  return lines.join('\n');
}
