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
}

export const DEFAULT_CONFIG: MergeWatchConfig = {
  model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  lightModel: 'anthropic.claude-3-haiku-20240307-v1:0',
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
