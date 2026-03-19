/**
 * TypeScript types for GitHub webhook payloads and related structures.
 *
 * These types cover the subset of GitHub's webhook API that MergeWatch
 * consumes: pull_request events, issue_comment events, and installation events.
 * They are intentionally narrower than the full GitHub API schema — we only
 * model the fields we actually read so the compiler can catch drift early.
 */

// ---------------------------------------------------------------------------
// Shared / common types
// ---------------------------------------------------------------------------

/** Minimal representation of a GitHub user (actor). */
export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  type: "User" | "Organization" | "Bot";
}

/** Minimal representation of a GitHub repository. */
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
  private: boolean;
  html_url: string;
  default_branch: string;
}

/** A Git ref attached to a pull request (head or base). */
export interface GitHubPullRequestRef {
  label: string;
  ref: string;
  sha: string;
  repo: GitHubRepository;
}

/** Minimal representation of a pull request. */
export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  /** The branch being merged *from*. */
  head: GitHubPullRequestRef;
  /** The branch being merged *into*. */
  base: GitHubPullRequestRef;
  user: GitHubUser;
  /** ISO-8601 timestamps. */
  created_at: string;
  updated_at: string;
  /** List of changed file paths — only present on certain API responses. */
  changed_files?: number;
}

/** Minimal representation of an issue comment. */
export interface GitHubIssueComment {
  id: number;
  body: string;
  user: GitHubUser;
  html_url: string;
  created_at: string;
  updated_at: string;
}

/** Minimal representation of an issue (used in issue_comment events). */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  /** A pull request key is present only when the issue *is* a pull request. */
  pull_request?: {
    url: string;
    html_url: string;
  };
  user: GitHubUser;
}

/** GitHub App installation (subset of fields we care about). */
export interface GitHubInstallation {
  id: number;
  account: GitHubUser;
  app_id: number;
  target_type: "User" | "Organization";
  /** Repositories the installation has access to (may be truncated). */
  repositories?: GitHubRepository[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Webhook event payloads
// ---------------------------------------------------------------------------

/**
 * `pull_request` event.
 * We care about `opened` (new PR) and `synchronize` (new commits pushed).
 */
export interface PullRequestEvent {
  action:
    | "opened"
    | "synchronize"
    | "closed"
    | "reopened"
    | "edited"
    | "ready_for_review"
    | "converted_to_draft";
  number: number;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  installation?: { id: number };
  sender: GitHubUser;
}

/**
 * `issue_comment` event.
 * We trigger a review when the comment body contains `@mergewatch`.
 */
export interface IssueCommentEvent {
  action: "created" | "edited" | "deleted";
  comment: GitHubIssueComment;
  issue: GitHubIssue;
  repository: GitHubRepository;
  installation?: { id: number };
  sender: GitHubUser;
}

/**
 * `installation` event.
 * Fired when a user installs / uninstalls the GitHub App.
 */
export interface InstallationEvent {
  action: "created" | "deleted" | "suspend" | "unsuspend" | "new_permissions_accepted";
  installation: GitHubInstallation;
  /** Repositories added during installation (only on `created`). */
  repositories?: GitHubRepository[];
  sender: GitHubUser;
}

// ---------------------------------------------------------------------------
// Discriminated union for routing
// ---------------------------------------------------------------------------

/** All webhook events MergeWatch handles, keyed by their X-GitHub-Event header. */
export type WebhookEvent =
  | { eventType: "pull_request"; payload: PullRequestEvent }
  | { eventType: "issue_comment"; payload: IssueCommentEvent }
  | { eventType: "installation"; payload: InstallationEvent };

// ---------------------------------------------------------------------------
// Internal types used by the review pipeline
// ---------------------------------------------------------------------------

/** The review "mode" derived from an @mergewatch mention. */
export type ReviewMode = "review" | "summary" | "respond";

/** Context we extract from a PR before handing it to the review agent. */
export interface PRContext {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  description: string | null;
  baseBranch: string;
  headBranch: string;
  files: string[];
  /** Total lines added across all files */
  totalAdditions: number;
  /** Total lines deleted across all files */
  totalDeletions: number;
}

/** Shape of the async invocation payload sent to the ReviewAgent Lambda. */
export interface ReviewJobPayload {
  installationId: number;
  owner: string;
  repo: string;
  prNumber: number;
  mode: ReviewMode;
  /** If we already found an existing bot comment, pass its ID so the agent can update it. */
  existingCommentId?: number;
  /** For "respond" mode: the user's comment body that triggered the response. */
  userComment?: string;
  /** For "respond" mode: the login of the user who commented. */
  userCommentAuthor?: string;
}
