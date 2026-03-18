// ─── Interfaces ─────────────────────────────────────────────────────────────
export type { ILLMProvider } from './llm/types.js';
export type { IInstallationStore, IReviewStore } from './storage/types.js';
export type { IGitHubAuthProvider } from './github/auth.js';
export type {
  IDashboardStore,
  IDashboardInstallationStore,
  IDashboardReviewStore,
  PaginatedResult,
  ReviewStats,
  RepoStats,
} from './storage/dashboard-types.js';

// ─── Agents ─────────────────────────────────────────────────────────────────
export {
  runReviewPipeline,
  runSecurityAgent,
  runBugAgent,
  runStyleAgent,
  runErrorHandlingAgent,
  runTestCoverageAgent,
  runCommentAccuracyAgent,
  runSummaryAgent,
  runDiagramAgent,
  runOrchestratorAgent,
  runCustomAgent,
} from './agents/reviewer.js';
export type {
  AgentFinding,
  OrchestratedFinding,
  ReviewContext,
  DiagramResult,
  OrchestratorResult,
  ReviewPipelineOptions,
  ReviewPipelineResult,
} from './agents/reviewer.js';

export {
  SECURITY_REVIEWER_PROMPT,
  BUG_REVIEWER_PROMPT,
  STYLE_REVIEWER_PROMPT,
  SUMMARY_PROMPT,
  DIAGRAM_PROMPT,
  ERROR_HANDLING_REVIEWER_PROMPT,
  TEST_COVERAGE_REVIEWER_PROMPT,
  COMMENT_ACCURACY_REVIEWER_PROMPT,
  ORCHESTRATOR_PROMPT,
  RESPOND_PROMPT,
  CUSTOM_AGENT_RESPONSE_FORMAT,
} from './agents/prompts.js';

// ─── GitHub client (portable Octokit ops) ───────────────────────────────────
export {
  BOT_COMMENT_MARKER,
  getPRDiff,
  getPRContext,
  addPRReaction,
  postReviewComment,
  updateReviewComment,
  findExistingBotComment,
  getCommentReactions,
  createCheckRun,
  postReplyComment,
  mergeScoreToReviewEvent,
  submitPRReview,
  dismissStaleReviews,
  fetchRepoConfig,
} from './github/client.js';

// ─── Comment formatter ──────────────────────────────────────────────────────
export { formatReviewComment } from './comment-formatter.js';
export type { Finding } from './comment-formatter.js';

// ─── Config ─────────────────────────────────────────────────────────────────
export { DEFAULT_CONFIG, mergeConfig } from './config/defaults.js';
export type { MergeWatchConfig, CustomAgentDef } from './config/defaults.js';

// ─── Context (codebase awareness) ────────────────────────────────────────────
export { fetchFileContents } from './context/file-fetcher.js';
export { resolveImports, resolveImportsForFiles } from './context/import-resolver.js';

// ─── Skip logic ─────────────────────────────────────────────────────────────
export { shouldSkipPR, SKIP_PATTERNS } from './skip-logic.js';

// ─── Types ──────────────────────────────────────────────────────────────────
export type {
  GitHubUser,
  GitHubRepository,
  GitHubPullRequestRef,
  GitHubPullRequest,
  GitHubIssueComment,
  GitHubIssue,
  GitHubInstallation,
  PullRequestEvent,
  IssueCommentEvent,
  InstallationEvent,
  WebhookEvent,
  ReviewMode,
  PRContext,
  ReviewJobPayload,
} from './types/github.js';

export type {
  RepoConfig,
  InstallationItem,
  InstallationSettings,
  ReviewItem,
  ReviewStatus,
  ReviewFinding,
  InstallationKey,
  ReviewKey,
  CreateReviewInput,
  UpdateReviewInput,
} from './types/db.js';

export { DEFAULT_INSTALLATION_SETTINGS } from './types/db.js';
