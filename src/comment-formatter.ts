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
  category: 'security' | 'bug' | 'style';
  title: string;
  description: string;
  suggestion: string;
}

interface FormatOptions {
  /** Model alias shown in the header (e.g. "claude-3-5-sonnet") */
  modelName: string;
  /** Short commit SHA */
  commitSha: string;
  /** Markdown summary text from the summary agent */
  summary: string;
  /** Deduplicated + ranked findings from the orchestrator */
  findings: Finding[];
  /** Custom footer line from installation settings */
  commentHeader?: string;
  /** Whether to show the summary section */
  showSummary?: boolean;
  /** Whether to show the issues table */
  showIssuesTable?: boolean;
}

// ─── Severity display config ───────────────────────────────────────────────

const SEVERITY_META: Record<Finding['severity'], { emoji: string; label: string; order: number }> = {
  critical: { emoji: '\uD83D\uDD34', label: 'Critical', order: 0 },
  warning:  { emoji: '\uD83D\uDFE1', label: 'Warnings', order: 1 },
  info:     { emoji: '\uD83D\uDD35', label: 'Info',     order: 2 },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

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
function renderFinding(f: Finding): string {
  let line = `- **\`${f.file}:${f.line}\`** — ${f.title}`;
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
    modelName,
    commitSha,
    summary,
    findings,
    commentHeader,
    showSummary = true,
    showIssuesTable = true,
  } = options;
  const shortSha = commitSha.slice(0, 7);

  const lines: string[] = [];

  // Hidden marker for upsert logic
  lines.push('<!-- mergewatch-review -->');

  // Header
  lines.push('## \uD83D\uDD0D MergeWatch Review');
  lines.push(
    `> Model: \`${modelName}\` \u00B7 Commit: \`${shortSha}\` \u00B7 [Configure](.mergewatch.yml)`,
  );
  lines.push('');

  // Summary (collapsible)
  if (summary && showSummary) {
    lines.push('<details><summary>\uD83D\uDCCB Summary</summary>');
    lines.push('');
    lines.push(summary);
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
        lines.push(renderFinding(item));
      }
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  if (commentHeader) {
    lines.push(commentHeader);
  } else {
    lines.push(
      '_Powered by [MergeWatch](https://mergewatch.ai) · Add a `.mergewatch.yml` to customise reviews_',
    );
  }

  return lines.join('\n');
}
