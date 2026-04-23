// ─── Server factory ─────────────────────────────────────────────────────────
export { createMcpServer, MissingAuthContextError } from './server.js';
export type { CreateMcpServerOptions } from './server.js';
export type { McpServerDeps } from './server-deps.js';

// ─── Middleware ─────────────────────────────────────────────────────────────
export {
  AuthError,
  API_KEY_PREFIX,
  extractBearerToken,
  hashApiKey,
  isRepoInScope,
  resolveApiKey,
} from './middleware/auth.js';
export type { AuthErrorCode, AuthResolution } from './middleware/auth.js';

export {
  BillingBlockedError,
  checkMcpBilling,
  mintSessionId,
  recordMcpReview,
  resolveOrCreateSession,
} from './middleware/billing.js';
export type {
  BillingCheckFn,
  RecordReviewFn,
  RecordMcpReviewInput,
  SessionResolution,
} from './middleware/billing.js';

// ─── Session math ───────────────────────────────────────────────────────────
export {
  SESSION_TTL_SECONDS,
  computeBillingDelta,
  computeSessionTtl,
  isSessionActive,
} from './session-math.js';
export type { BillingDelta } from './session-math.js';

// ─── Tools ──────────────────────────────────────────────────────────────────
export {
  buildOutput as buildReviewDiffOutput,
  handleReviewDiff,
  loadRepoContext,
  splitOwnerRepo,
  validateInput as validateReviewDiffInput,
} from './tools/review-diff.js';
export type {
  ReviewDiffInput,
  ReviewDiffOutput,
  ReviewDiffStats,
} from './tools/review-diff.js';

export { handleGetReviewStatus } from './tools/get-review-status.js';
export type {
  GetReviewStatusInput,
  GetReviewStatusOutput,
} from './tools/get-review-status.js';

// ─── Resources ──────────────────────────────────────────────────────────────
export {
  CONVENTIONS_URI_PREFIX,
  handleConventionsResource,
  parseConventionsUri,
} from './resources/conventions.js';
export type { ConventionsResourceOutput } from './resources/conventions.js';

// ─── HTTP transport ─────────────────────────────────────────────────────────
export {
  dispatchMcpRequest,
  dispatchMcpBatch,
  ERROR_CODES,
  MCP_PROTOCOL_VERSION,
} from './http-dispatcher.js';
export type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccess,
  JsonRpcErrorResponse,
} from './http-dispatcher.js';
