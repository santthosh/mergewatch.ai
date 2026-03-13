/**
 * Default configuration values for MergeWatch reviews.
 * These are used when no .mergewatch.yml is found in the repository
 * or when specific fields are omitted from the config.
 */

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
  /** Maximum depth for resolving import dependencies (1-2) */
  maxDependencyDepth: number;
  /** Maximum total size of related file context in KB */
  maxContextKB: number;
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
  maxDependencyDepth: 1,
  maxContextKB: 256,
};

/**
 * Merges a partial user config (from .mergewatch.yml / DynamoDB) with defaults.
 * Only defined fields in the partial override the defaults.
 */
export function mergeConfig(partial: Partial<MergeWatchConfig>): MergeWatchConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    agents: {
      ...DEFAULT_CONFIG.agents,
      ...(partial.agents ?? {}),
    },
  };
}
