/**
 * Default configuration values for MergeWatch reviews.
 * These are used when no .mergewatch.yml is found in the repository
 * or when specific fields are omitted from the config.
 */

/** Definition of a user-defined custom review agent. */
export interface CustomAgentDef {
  /** Display name for the agent (used as finding category) */
  name: string;
  /** System prompt for the agent */
  prompt: string;
  /** Default severity for findings from this agent */
  severityDefault: 'info' | 'warning' | 'critical';
  /** Whether this custom agent is enabled */
  enabled: boolean;
}

export interface UXConfig {
  /** Tone of review findings: collaborative (default), direct, or advisory */
  tone: 'collaborative' | 'direct' | 'advisory';
  /** Whether to show the "work done" section in the review comment */
  showWorkDone: boolean;
  /** Whether to show how many findings were suppressed by the orchestrator */
  showSuppressedCount: boolean;
  /** Whether to show a reviewer checklist derived from top findings */
  reviewerChecklist: boolean;
  /** Whether to show a special "all clear" message when there are no findings */
  allClearMessage: boolean;
  /** Custom header text for the review comment (replaces default logo) */
  commentHeader: string;
}

export const DEFAULT_UX_CONFIG: UXConfig = {
  tone: 'collaborative',
  showWorkDone: true,
  showSuppressedCount: true,
  reviewerChecklist: true,
  allClearMessage: true,
  commentHeader: '',
};

export interface MergeWatchConfig {
  /** Primary model used for review agents */
  model: string;
  /** Lightweight model used for summary/orchestration when cost matters */
  lightModel: string;
  /** Maximum tokens for each agent response */
  maxTokensPerAgent: number;
  /** Which review agents to enable */
  agents: {
    security: boolean;
    bugs: boolean;
    style: boolean;
    summary: boolean;
    diagram: boolean;
    errorHandling: boolean;
    testCoverage: boolean;
    commentAccuracy: boolean;
  };
  /** Custom style rules appended to the style agent prompt */
  customStyleRules: string[];
  /** File patterns to exclude from review (glob syntax) */
  excludePatterns: string[];
  /** Minimum severity to report: 'info' | 'warning' | 'critical' */
  minSeverity: 'info' | 'warning' | 'critical';
  /** Maximum number of findings to include in the comment */
  maxFindings: number;
  /** Whether to post a summary even when there are no findings */
  postSummaryOnClean: boolean;
  /** Whether to fetch related file contents for context-aware reviews */
  codebaseAwareness: boolean;
  /** Maximum rounds of agentic file requests per agent (1-2) */
  maxFileRequestRounds: number;
  /** Maximum total size of related file context in KB */
  maxContextKB: number;
  /** User-defined custom review agents */
  customAgents: CustomAgentDef[];
  /** UX configuration for reviewer experience */
  ux: UXConfig;
}

export const DEFAULT_CONFIG: MergeWatchConfig = {
  model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  lightModel: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  maxTokensPerAgent: 4096,
  agents: {
    security: true,
    bugs: true,
    style: true,
    summary: true,
    diagram: true,
    errorHandling: true,
    testCoverage: true,
    commentAccuracy: true,
  },
  customStyleRules: [],
  excludePatterns: [
    '**/*.lock',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/*.min.js',
    '**/*.min.css',
    '**/dist/**',
    '**/build/**',
    '**/node_modules/**',
  ],
  minSeverity: 'info',
  maxFindings: 25,
  postSummaryOnClean: true,
  codebaseAwareness: true,
  maxFileRequestRounds: 1,
  maxContextKB: 256,
  customAgents: [],
  ux: { ...DEFAULT_UX_CONFIG },
};

/**
 * Merges a partial user config (from .mergewatch.yml / DynamoDB) with defaults.
 * Only defined fields in the partial override the defaults.
 */
export function mergeConfig(partial: Partial<Omit<MergeWatchConfig, 'agents' | 'ux'>> & { agents?: Partial<MergeWatchConfig['agents']>; ux?: Partial<UXConfig> }): MergeWatchConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    agents: {
      ...DEFAULT_CONFIG.agents,
      ...(partial.agents ?? {}),
    },
    customAgents: partial.customAgents ?? DEFAULT_CONFIG.customAgents,
    ux: {
      ...DEFAULT_UX_CONFIG,
      ...(partial.ux ?? {}),
    },
  };
}
