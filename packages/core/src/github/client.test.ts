import { describe, it, expect } from 'vitest';
import {
  mergeScoreToReviewEvent,
  buildIssueCommentUrl,
  buildInlineComments,
  formatPRReviewVerdict,
  extractInlineCommentTitle,
  BOT_COMMENT_MARKER,
  parseRepoConfigYaml,
} from './client.js';

// ---------------------------------------------------------------------------
// mergeScoreToReviewEvent
// ---------------------------------------------------------------------------

describe('mergeScoreToReviewEvent', () => {
  it('returns APPROVE for score 5', () => {
    expect(mergeScoreToReviewEvent(5)).toBe('APPROVE');
  });

  it('returns APPROVE for score 4', () => {
    expect(mergeScoreToReviewEvent(4)).toBe('APPROVE');
  });

  it('returns COMMENT for score 3', () => {
    expect(mergeScoreToReviewEvent(3)).toBe('COMMENT');
  });

  it('returns REQUEST_CHANGES for score 2', () => {
    expect(mergeScoreToReviewEvent(2)).toBe('REQUEST_CHANGES');
  });

  it('returns REQUEST_CHANGES for score 1', () => {
    expect(mergeScoreToReviewEvent(1)).toBe('REQUEST_CHANGES');
  });

  it('returns APPROVE for scores above 5', () => {
    expect(mergeScoreToReviewEvent(6)).toBe('APPROVE');
  });

  it('returns REQUEST_CHANGES for scores below 1', () => {
    expect(mergeScoreToReviewEvent(0)).toBe('REQUEST_CHANGES');
  });
});

// ---------------------------------------------------------------------------
// buildIssueCommentUrl
// ---------------------------------------------------------------------------

describe('buildIssueCommentUrl', () => {
  it('builds the correct URL', () => {
    const url = buildIssueCommentUrl('acme', 'widget', 42, 123456);
    expect(url).toBe('https://github.com/acme/widget/pull/42#issuecomment-123456');
  });

  it('handles special characters in owner/repo', () => {
    const url = buildIssueCommentUrl('my-org', 'my-repo.js', 1, 1);
    expect(url).toBe('https://github.com/my-org/my-repo.js/pull/1#issuecomment-1');
  });
});

// ---------------------------------------------------------------------------
// buildInlineComments
// ---------------------------------------------------------------------------

describe('buildInlineComments', () => {
  const changedFiles = ['src/app.ts', 'src/utils.ts', 'README.md'];

  it('includes critical findings on changed files', () => {
    const findings = [
      { file: 'src/app.ts', line: 10, severity: 'critical' as const, title: 'SQL Injection', description: 'User input used directly in query', suggestion: 'Use parameterized queries' },
    ];
    const result = buildInlineComments(findings, changedFiles);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/app.ts');
    expect(result[0].line).toBe(10);
    expect(result[0].side).toBe('RIGHT');
  });

  it('excludes non-critical findings (warning)', () => {
    const findings = [
      { file: 'src/app.ts', line: 10, severity: 'warning' as const, title: 'Naming', description: 'Bad name', suggestion: '' },
    ];
    const result = buildInlineComments(findings, changedFiles);
    expect(result).toHaveLength(0);
  });

  it('excludes non-critical findings (info)', () => {
    const findings = [
      { file: 'src/app.ts', line: 10, severity: 'info' as const, title: 'Tip', description: 'Consider this', suggestion: '' },
    ];
    const result = buildInlineComments(findings, changedFiles);
    expect(result).toHaveLength(0);
  });

  it('excludes findings on files not in changed list', () => {
    const findings = [
      { file: 'src/other.ts', line: 5, severity: 'critical' as const, title: 'Bug', description: 'Oops', suggestion: '' },
    ];
    const result = buildInlineComments(findings, changedFiles);
    expect(result).toHaveLength(0);
  });

  it('excludes findings with line=0', () => {
    const findings = [
      { file: 'src/app.ts', line: 0, severity: 'critical' as const, title: 'Bug', description: 'Oops', suggestion: '' },
    ];
    const result = buildInlineComments(findings, changedFiles);
    expect(result).toHaveLength(0);
  });

  it('excludes findings with negative line numbers', () => {
    const findings = [
      { file: 'src/app.ts', line: -1, severity: 'critical' as const, title: 'Bug', description: 'Oops', suggestion: '' },
    ];
    const result = buildInlineComments(findings, changedFiles);
    expect(result).toHaveLength(0);
  });

  it('handles multiple eligible findings', () => {
    const findings = [
      { file: 'src/app.ts', line: 10, severity: 'critical' as const, title: 'A', description: 'desc', suggestion: '' },
      { file: 'src/utils.ts', line: 20, severity: 'critical' as const, title: 'B', description: 'desc', suggestion: '' },
    ];
    const result = buildInlineComments(findings, changedFiles);
    expect(result).toHaveLength(2);
  });

  it('formats comment body with title and description', () => {
    const findings = [
      { file: 'src/app.ts', line: 10, severity: 'critical' as const, title: 'SQL Injection', description: 'Unsafe query', suggestion: '' },
    ];
    const result = buildInlineComments(findings, changedFiles);
    expect(result[0].body).toContain('SQL Injection');
    expect(result[0].body).toContain('Unsafe query');
  });

  it('includes suggestion in comment body when present', () => {
    const findings = [
      { file: 'src/app.ts', line: 10, severity: 'critical' as const, title: 'Bug', description: 'Bad', suggestion: 'Fix it' },
    ];
    const result = buildInlineComments(findings, changedFiles);
    expect(result[0].body).toContain('Suggestion');
    expect(result[0].body).toContain('Fix it');
  });

  it('omits suggestion section when suggestion is empty', () => {
    const findings = [
      { file: 'src/app.ts', line: 10, severity: 'critical' as const, title: 'Bug', description: 'Bad', suggestion: '' },
    ];
    const result = buildInlineComments(findings, changedFiles);
    expect(result[0].body).not.toContain('Suggestion');
  });

  it('returns empty array for empty findings', () => {
    expect(buildInlineComments([], changedFiles)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// formatPRReviewVerdict
// ---------------------------------------------------------------------------

describe('formatPRReviewVerdict', () => {
  const url = 'https://github.com/o/r/pull/1#issuecomment-1';

  it('shows positive message for high score with no findings', () => {
    const result = formatPRReviewVerdict(5, 'Clean code', { critical: 0, warning: 0, info: 0 }, url);
    expect(result).toContain('5/5');
    expect(result).toContain('Looks great');
    expect(result).toContain('No issues found');
    expect(result).toContain(url);
  });

  it('shows critical warning for low score with critical findings', () => {
    const result = formatPRReviewVerdict(1, 'Issues found', { critical: 3, warning: 0, info: 0 }, url);
    expect(result).toContain('1/5');
    expect(result).toContain('Critical issues');
    expect(result).toContain('3 critical issues');
  });

  it('pluralizes single critical finding correctly', () => {
    const result = formatPRReviewVerdict(2, 'Issue found', { critical: 1, warning: 0, info: 0 }, url);
    expect(result).toContain('1 critical issue');
    expect(result).toContain('needs');
    expect(result).not.toContain('issues that need');
  });

  it('includes link to issue comment', () => {
    const result = formatPRReviewVerdict(4, 'LGTM', { critical: 0, warning: 0, info: 0 }, url);
    expect(result).toContain(`[View full review](${url})`);
  });

  it('shows warning count when no critical findings', () => {
    const result = formatPRReviewVerdict(3, 'Some warnings', { critical: 0, warning: 2, info: 1 }, url);
    expect(result).toContain('3 findings to review');
  });

  it('shows info suggestions when only info findings', () => {
    const result = formatPRReviewVerdict(4, 'Minor things', { critical: 0, warning: 0, info: 2 }, url);
    expect(result).toContain('2 suggestions for improvement');
  });

  it('shows singular suggestion for 1 info finding', () => {
    const result = formatPRReviewVerdict(4, 'Minor', { critical: 0, warning: 0, info: 1 }, url);
    expect(result).toContain('1 suggestion for improvement');
    expect(result).not.toContain('suggestions');
  });

  it('handles unknown score gracefully', () => {
    const result = formatPRReviewVerdict(99, 'Unknown', { critical: 0, warning: 0, info: 0 }, url);
    expect(result).toContain('Review complete');
  });
});

// ---------------------------------------------------------------------------
// extractInlineCommentTitle
// ---------------------------------------------------------------------------

describe('extractInlineCommentTitle', () => {
  it('extracts title from formatted inline comment', () => {
    const body = '**\u{1F534} SQL Injection**\n\nUser input used in query';
    expect(extractInlineCommentTitle(body)).toBe('SQL Injection');
  });

  it('returns empty string for unrelated text', () => {
    expect(extractInlineCommentTitle('just some random text')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(extractInlineCommentTitle('')).toBe('');
  });

  it('extracts title with special characters', () => {
    const body = '**\u{1F534} Use `parameterized` queries (SQL)**\n\nDescription here';
    expect(extractInlineCommentTitle(body)).toBe('Use `parameterized` queries (SQL)');
  });
});

// ---------------------------------------------------------------------------
// BOT_COMMENT_MARKER
// ---------------------------------------------------------------------------

describe('BOT_COMMENT_MARKER', () => {
  it('is an HTML comment', () => {
    expect(BOT_COMMENT_MARKER).toMatch(/^<!--[\s\S]*-->$/);
  });
});

// ---------------------------------------------------------------------------
// parseRepoConfigYaml
// ---------------------------------------------------------------------------

describe('parseRepoConfigYaml', () => {
  it('returns null for empty string', () => {
    expect(parseRepoConfigYaml('')).toBeNull();
  });

  it('returns null for non-object YAML', () => {
    expect(parseRepoConfigYaml('just a string')).toBeNull();
  });

  it('parses model field', () => {
    const result = parseRepoConfigYaml('model: my-model');
    expect(result?.model).toBe('my-model');
  });

  it('ignores invalid model type', () => {
    const result = parseRepoConfigYaml('model: 123');
    expect(result?.model).toBeUndefined();
  });

  it('parses agents as boolean object', () => {
    const yaml = `
agents:
  security: false
  bugs: true
  style: false
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.agents?.security).toBe(false);
    expect(result?.agents?.bugs).toBe(true);
    expect(result?.agents?.style).toBe(false);
    expect(result?.agents?.summary).toBe(true); // default when not specified
  });

  it('ignores agents when it is an array (wrong format)', () => {
    const yaml = `
agents:
  - name: security
    enabled: true
`;
    const result = parseRepoConfigYaml(yaml);
    // Array-based agents format: parsed.agents is an array, typeof === 'object' is true
    // but the boolean checks will all fail, so all agents default to true
    expect(result?.agents?.security).toBe(true);
  });

  // ─── Rules parsing ───────────────────────────────────────────────────────
  it('parses rules with all fields', () => {
    const yaml = `
rules:
  maxFiles: 30
  ignorePatterns:
    - "*.lock"
    - "dist/**"
  autoReview: false
  reviewOnMention: true
  skipDrafts: false
  ignoreLabels:
    - wip
    - draft
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.rules).toBeDefined();
    expect(result!.rules!.maxFiles).toBe(30);
    expect(result!.rules!.ignorePatterns).toEqual(['*.lock', 'dist/**']);
    expect(result!.rules!.autoReview).toBe(false);
    expect(result!.rules!.reviewOnMention).toBe(true);
    expect(result!.rules!.skipDrafts).toBe(false);
    expect(result!.rules!.ignoreLabels).toEqual(['wip', 'draft']);
  });

  it('parses partial rules (only some fields)', () => {
    const yaml = `
rules:
  skipDrafts: false
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.rules).toBeDefined();
    expect(result!.rules!.skipDrafts).toBe(false);
    expect(result!.rules!.maxFiles).toBeUndefined();
    expect(result!.rules!.autoReview).toBeUndefined();
  });

  it('ignores invalid rule field types', () => {
    const yaml = `
rules:
  maxFiles: "not a number"
  skipDrafts: "yes"
  autoReview: 1
  ignorePatterns: "not-an-array"
  ignoreLabels:
    - valid-label
    - 123
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.rules).toBeDefined();
    expect(result!.rules!.maxFiles).toBeUndefined();
    expect(result!.rules!.skipDrafts).toBeUndefined();
    expect(result!.rules!.autoReview).toBeUndefined();
    expect(result!.rules!.ignorePatterns).toBeUndefined();
    // ignoreLabels filters non-strings
    expect(result!.rules!.ignoreLabels).toEqual(['valid-label']);
  });

  it('returns no rules when rules block is absent', () => {
    const result = parseRepoConfigYaml('model: my-model');
    expect(result?.rules).toBeUndefined();
  });

  // ─── includePatterns parsing ─────────────────────────────────────────────
  it('parses includePatterns as a string array', () => {
    const yaml = `
includePatterns:
  - "docs/runbooks/**"
  - "**/SECURITY.md"
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.includePatterns).toEqual(['docs/runbooks/**', '**/SECURITY.md']);
  });

  it('filters non-string entries from includePatterns', () => {
    const yaml = `
includePatterns:
  - "docs/**"
  - 42
  - null
  - "RUNBOOK.md"
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.includePatterns).toEqual(['docs/**', 'RUNBOOK.md']);
  });

  it('ignores includePatterns when not an array', () => {
    const result = parseRepoConfigYaml('includePatterns: "docs/**"');
    expect(result?.includePatterns).toBeUndefined();
  });

  it('returns no includePatterns when field is absent', () => {
    const result = parseRepoConfigYaml('model: my-model');
    expect(result?.includePatterns).toBeUndefined();
  });

  // ─── UX parsing ──────────────────────────────────────────────────────────
  it('parses ux config', () => {
    const yaml = `
ux:
  tone: direct
  showWorkDone: false
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.ux?.tone).toBe('direct');
    expect(result?.ux?.showWorkDone).toBe(false);
  });

  // ─── Custom agents ───────────────────────────────────────────────────────
  it('parses customAgents array', () => {
    const yaml = `
customAgents:
  - name: perf
    prompt: "Check for performance issues"
    severityDefault: warning
    enabled: true
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.customAgents).toHaveLength(1);
    expect(result!.customAgents![0].name).toBe('perf');
    expect(result!.customAgents![0].severityDefault).toBe('warning');
  });

  // ─── Agent review parsing ────────────────────────────────────────────────
  it('parses a full agentReview block', () => {
    const yaml = `
agentReview:
  enabled: true
  strictChecks: true
  autoIterate: false
  maxIterations: 5
  passThreshold: scoreAtLeast4
  detection:
    commitTrailers:
      - "Co-authored-by: Claude"
      - "Co-authored-by: Cursor"
    branchPrefixes:
      - "claude/"
      - "cursor/"
    labels:
      - ai-generated
      - bot
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.agentReview).toBeDefined();
    expect(result!.agentReview!.enabled).toBe(true);
    expect(result!.agentReview!.strictChecks).toBe(true);
    expect(result!.agentReview!.autoIterate).toBe(false);
    expect(result!.agentReview!.maxIterations).toBe(5);
    expect(result!.agentReview!.passThreshold).toBe('scoreAtLeast4');
    expect(result!.agentReview!.detection!.commitTrailers).toEqual([
      'Co-authored-by: Claude',
      'Co-authored-by: Cursor',
    ]);
    expect(result!.agentReview!.detection!.branchPrefixes).toEqual(['claude/', 'cursor/']);
    expect(result!.agentReview!.detection!.labels).toEqual(['ai-generated', 'bot']);
  });

  it('leaves agentReview undefined when block is missing', () => {
    const result = parseRepoConfigYaml('model: foo');
    expect(result?.agentReview).toBeUndefined();
  });

  it('parses partial agentReview (only enabled)', () => {
    const yaml = `
agentReview:
  enabled: true
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.agentReview).toBeDefined();
    expect(result!.agentReview!.enabled).toBe(true);
    expect(result!.agentReview!.strictChecks).toBeUndefined();
    expect(result!.agentReview!.autoIterate).toBeUndefined();
    expect(result!.agentReview!.maxIterations).toBeUndefined();
    expect(result!.agentReview!.passThreshold).toBeUndefined();
    expect(result!.agentReview!.detection).toBeUndefined();
  });

  it('omits invalid passThreshold while keeping other valid fields', () => {
    const yaml = `
agentReview:
  enabled: true
  passThreshold: bogus
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.agentReview).toBeDefined();
    expect(result!.agentReview!.enabled).toBe(true);
    expect(result!.agentReview!.passThreshold).toBeUndefined();
  });

  it('omits invalid maxIterations (negative, zero, non-integer, >20)', () => {
    const cases = [
      'maxIterations: -1',
      'maxIterations: 0',
      'maxIterations: 2.5',
      'maxIterations: 21',
      'maxIterations: "3"',
    ];
    for (const line of cases) {
      const result = parseRepoConfigYaml(`agentReview:\n  enabled: true\n  ${line}\n`);
      expect(result?.agentReview).toBeDefined();
      expect(result!.agentReview!.enabled).toBe(true);
      expect(result!.agentReview!.maxIterations, line).toBeUndefined();
    }
  });

  it('filters non-string entries from detection.commitTrailers', () => {
    const yaml = `
agentReview:
  detection:
    commitTrailers:
      - "Co-authored-by: Claude"
      - 123
      - null
      - "Co-authored-by: Cursor"
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.agentReview?.detection?.commitTrailers).toEqual([
      'Co-authored-by: Claude',
      'Co-authored-by: Cursor',
    ]);
  });

  it('leaves detection undefined when absent', () => {
    const yaml = `
agentReview:
  enabled: true
  maxIterations: 3
`;
    const result = parseRepoConfigYaml(yaml);
    expect(result?.agentReview).toBeDefined();
    expect(result!.agentReview!.detection).toBeUndefined();
  });
});
