// ─── Interfaces ─────────────────────────────────────────────────────────────
export type { ILLMProvider, TokenUsage, LLMInvokeResult } from './llm/types.js';
export { normalizeLLMResult } from './llm/types.js';
export { TokenAccumulator, TrackingLLMProvider } from './llm/token-accumulator.js';
export { estimateCost, DEFAULT_PRICING } from './llm/pricing.js';
export type {
  IInstallationStore,
  IReviewStore,
  IApiKeyStore,
  IMcpSessionStore,
  ApiKeyRecord,
  McpSessionRecord,
} from './storage/types.js';
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
  isValidMermaidDiagram,
} from './agents/reviewer.js';
export {
  handleInlineReply,
  detectResolveIntent,
  MAX_BOT_REPLIES,
} from './agents/inline-reply.js';
export type { InlineReplyContext, InlineReplyDeps, InlineReplyResult } from './agents/inline-reply.js';
export type {
  AgentFinding,
  OrchestratedFinding,
  PreviousFinding,
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
  PREVIOUS_FINDINGS_PLACEHOLDER,
  CONVENTIONS_PLACEHOLDER,
  RESPOND_PROMPT,
  INLINE_REPLY_PROMPT,
  CUSTOM_AGENT_RESPONSE_FORMAT,
  TONE_DIRECTIVES,
  TONE_PLACEHOLDER,
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
  fetchReviewCommentThread,
  replyToReviewComment,
  addReviewCommentReaction,
  removeReviewCommentReaction,
  resolveReviewThread,
  findReviewThreadIdForComment,
  mergeScoreToReviewEvent,
  submitPRReview,
  dismissStaleReviews,
  buildIssueCommentUrl,
  formatPRReviewVerdict,
  buildInlineComments,
  extractInlineCommentTitle,
  fetchRepoConfig,
  parseRepoConfigYaml,
} from './github/client.js';
export type { ReviewThreadComment } from './github/client.js';

// ─── Comment formatter ──────────────────────────────────────────────────────
export { formatReviewComment, buildWorkDoneSection } from './comment-formatter.js';
export type { Finding, WorkDoneSection } from './comment-formatter.js';

// ─── Review delta ────────────────────────────────────────────────────────────
export { computeReviewDelta } from './review-delta.js';
export type { ReviewDelta, FindingLike } from './review-delta.js';

// ─── Config ─────────────────────────────────────────────────────────────────
export {
  DEFAULT_CONFIG,
  DEFAULT_UX_CONFIG,
  DEFAULT_RULES_CONFIG,
  DEFAULT_AGENT_REVIEW_CONFIG,
  PASS_THRESHOLDS,
  mergeConfig,
} from './config/defaults.js';
export type {
  MergeWatchConfig,
  CustomAgentDef,
  UXConfig,
  RulesConfig,
  AgentReviewConfig,
  AgentReviewDetectionConfig,
  PassThreshold,
} from './config/defaults.js';
export {
  fetchConventions,
  truncateConventions,
  DEFAULT_CONVENTIONS_PATHS,
  CONVENTIONS_MAX_BYTES,
} from './config/conventions.js';
export type { ConventionsLoadResult } from './config/conventions.js';

// ─── Context (agentic file fetching) ─────────────────────────────────────────
export { fetchFileContents } from './context/file-fetcher.js';
export { invokeWithFileFetching, FILE_REQUEST_INSTRUCTION } from './context/agentic-fetcher.js';
export type { FileFetchOptions, AgenticInvokeResult } from './context/agentic-fetcher.js';

// ─── Skip logic ─────────────────────────────────────────────────────────────
export { shouldSkipPR, shouldSkipByRules, SKIP_PATTERNS } from './skip-logic.js';

// ─── Diff filtering ─────────────────────────────────────────────────────────
export { filterDiff, extractChangedLines, isLineNearChange } from './diff-filter.js';

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
  PullRequestReviewCommentEvent,
  GitHubReviewComment,
  InstallationEvent,
  WebhookEvent,
  ReviewMode,
  PRContext,
  ReviewJobPayload,
} from './types/github.js';
export { REVIEW_TRIGGERING_ACTIONS, COMMENT_LOOKUP_ACTIONS } from './types/github.js';

export type {
  RepoConfig,
  InstallationItem,
  InstallationSettings,
  BillingFields,
  ReviewItem,
  ReviewStatus,
  ReviewFinding,
  InstallationKey,
  ReviewKey,
  CreateReviewInput,
  UpdateReviewInput,
} from './types/db.js';

export { DEFAULT_INSTALLATION_SETTINGS } from './types/db.js';
