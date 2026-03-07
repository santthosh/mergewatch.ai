// =============================================================================
// MergeWatch DynamoDB Type Definitions
// =============================================================================
//
// TypeScript types for all DynamoDB table items. These types are the single
// source of truth for the shape of data stored in DynamoDB.
//
// Tables:
//   1. mergewatch-installations — GitHub App installations and repo config
//   2. mergewatch-reviews       — PR review jobs and their status
//
// Usage:
//   import { InstallationItem, ReviewItem, ReviewStatus } from '../types/db';
// =============================================================================

// =============================================================================
// mergewatch-installations Table
// =============================================================================

/**
 * Configuration parsed from a repository's `.mergewatch.yml` file.
 *
 * This config is loaded when a GitHub App installation event is received
 * and cached in DynamoDB. It controls how MergeWatch reviews PRs for
 * this specific repository.
 *
 * Example `.mergewatch.yml`:
 * ```yaml
 * enabled: true
 * language: typescript
 * ignore:
 *   - "*.test.ts"
 *   - "dist/**"
 * reviewScope: changed-files
 * maxFileSize: 500
 * ```
 */
export interface RepoConfig {
  /** Whether MergeWatch is enabled for this repo (default: true) */
  enabled?: boolean;

  /** Primary language hint — helps the AI model provide better reviews */
  language?: string;

  /** Glob patterns for files to ignore during review */
  ignore?: string[];

  /**
   * What to include in the review context:
   *   - "changed-files": Only review files modified in the PR (default)
   *   - "full-diff": Send the entire diff for holistic review
   */
  reviewScope?: 'changed-files' | 'full-diff';

  /** Maximum file size in KB to include in review (files larger are skipped) */
  maxFileSize?: number;

  /**
   * Custom review prompt — appended to the system prompt sent to Bedrock.
   * Use this for repo-specific review guidelines.
   */
  customPrompt?: string;
}

/**
 * DynamoDB item for the `mergewatch-installations` table.
 *
 * Each item represents a single GitHub App installation for a specific
 * repository. The composite key (installationId + repoFullName) allows
 * querying all repos for a given installation, or looking up the config
 * for a specific repo.
 *
 * Table key schema:
 *   PK (Partition Key): installationId
 *   SK (Sort Key):      repoFullName
 */
export interface InstallationItem {
  // --- Key attributes ---

  /**
   * GitHub App installation ID (partition key).
   * This is a numeric ID assigned by GitHub, stored as a string in DynamoDB
   * because DynamoDB partition keys work best as strings.
   *
   * Example: "12345678"
   */
  installationId: string;

  /**
   * Full repository name in "owner/repo" format (sort key).
   * Using the full name ensures uniqueness across GitHub organizations.
   *
   * Example: "octocat/Hello-World"
   */
  repoFullName: string;

  // --- Data attributes ---

  /**
   * ISO 8601 timestamp of when the GitHub App was installed on this repo.
   * Set once during the installation webhook event.
   *
   * Example: "2025-01-15T10:30:00.000Z"
   */
  installedAt: string;

  /**
   * Parsed contents of the repository's `.mergewatch.yml` configuration file.
   * This is fetched from the repo's default branch during installation and
   * updated when the config file changes.
   *
   * Stored as a DynamoDB Map type. If the repo has no config file, this
   * will be an empty object (defaults are applied at review time).
   */
  config: RepoConfig;

  /**
   * Amazon Bedrock model ID override for this specific repository.
   * If set, this takes precedence over the global DEFAULT_BEDROCK_MODEL_ID.
   *
   * Use this to assign different models to different repos — for example,
   * a larger model for critical repos or a smaller model for high-volume repos.
   *
   * Example: "us.anthropic.claude-sonnet-4-20250514-v1:0"
   */
  modelId?: string;
}

// =============================================================================
// Installation-level Settings (stored as SK="#SETTINGS" sentinel row)
// =============================================================================

/**
 * Settings scoped to a GitHub App installation.
 * Stored as a sentinel row in mergewatch-installations with SK="#SETTINGS".
 * These are the defaults for all repos in this installation; per-repo
 * overrides are done via .mergewatch.yml files.
 */
export interface InstallationSettings {
  severityThreshold: 'Low' | 'Med' | 'High';
  commentTypes: { syntax: boolean; logic: boolean; style: boolean };
  maxComments: number;
  summary: {
    prSummary: boolean;
    confidenceScore: boolean;
    issuesTable: boolean;
    diagram: boolean;
  };
  customInstructions: string;
  commentHeader: string;
}

export const DEFAULT_INSTALLATION_SETTINGS: InstallationSettings = {
  severityThreshold: 'Med',
  commentTypes: { syntax: true, logic: true, style: true },
  maxComments: 10,
  summary: {
    prSummary: true,
    confidenceScore: true,
    issuesTable: true,
    diagram: true,
  },
  customInstructions: '',
  commentHeader: '> *Review generated by [MergeWatch](https://mergewatch.ai)*',
};

// =============================================================================
// mergewatch-reviews Table
// =============================================================================

/**
 * Enum-like type for review job status.
 *
 * State machine:
 *   pending -> in_progress -> complete
 *                          -> failed
 *
 * - pending:     Review job created, waiting for ReviewAgent to pick it up
 * - in_progress: ReviewAgent is actively processing the PR
 * - complete:    Review posted to GitHub successfully
 * - failed:      Review failed (error details logged to CloudWatch)
 */
export type ReviewStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

/**
 * DynamoDB item for the `mergewatch-reviews` table.
 *
 * Each item represents a single review job for a specific PR at a specific
 * commit. When a new commit is pushed to a PR, a new review item is created
 * with the updated commit SHA in the sort key.
 *
 * Table key schema:
 *   PK (Partition Key): repoFullName
 *   SK (Sort Key):      prNumberCommitSha (format: "{prNumber}#{commitSha}")
 *
 * Access patterns:
 *   - Get a specific review:     PK=repoFullName, SK="42#abc123"
 *   - List reviews for a repo:   PK=repoFullName (Query)
 *   - List reviews for a PR:     PK=repoFullName, SK begins_with("42#") (Query)
 */
export interface ReviewItem {
  // --- Key attributes ---

  /**
   * Full repository name in "owner/repo" format (partition key).
   * Same format as InstallationItem.repoFullName.
   *
   * Example: "octocat/Hello-World"
   */
  repoFullName: string;

  /**
   * Composite sort key combining PR number and commit SHA.
   * Format: "{prNumber}#{shortCommitSha}"
   *
   * The PR number comes first so we can use begins_with() queries
   * to find all reviews for a specific PR.
   *
   * Example: "42#abc123def"
   */
  prNumberCommitSha: string;

  // --- Data attributes ---

  /**
   * Current status of the review job.
   * See ReviewStatus type for the state machine.
   */
  status: ReviewStatus;

  /**
   * GitHub comment ID for the review comment posted by MergeWatch.
   *
   * When a review is first posted, we store the comment ID so that
   * subsequent updates (e.g., re-review on new commits) can edit
   * the existing comment in-place instead of creating new ones.
   *
   * This is a number because GitHub's API returns comment IDs as numbers.
   * Optional because it's only set after the comment is created.
   */
  commentId?: number;

  /**
   * ISO 8601 timestamp of when the review job was created.
   * Set by WebhookHandler when the job is first enqueued.
   *
   * Example: "2025-01-15T10:30:00.000Z"
   */
  createdAt: string;

  /**
   * ISO 8601 timestamp of when the review job completed (or failed).
   * Set by ReviewAgent when the job finishes processing.
   * Undefined while the job is pending or in progress.
   *
   * Example: "2025-01-15T10:31:45.000Z"
   */
  completedAt?: string;

  /** PR title from GitHub, stored for display in the dashboard. */
  prTitle?: string;

  /** Bedrock model ID used for the review. */
  model?: string;

  /** Snapshot of the effective settings used for this review. */
  settingsUsed?: {
    severityThreshold: string;
    commentTypes: { syntax: boolean; logic: boolean; style: boolean };
    maxComments: number;
    summaryEnabled: boolean;
    customInstructions: boolean;
  };
}

// =============================================================================
// Helper Types
// =============================================================================
// Utility types for working with DynamoDB items in application code.

/**
 * Key-only type for InstallationItem — useful for GetItem/DeleteItem operations
 * where you only need to specify the key attributes.
 */
export type InstallationKey = Pick<InstallationItem, 'installationId' | 'repoFullName'>;

/**
 * Key-only type for ReviewItem — useful for GetItem/DeleteItem operations.
 */
export type ReviewKey = Pick<ReviewItem, 'repoFullName' | 'prNumberCommitSha'>;

/**
 * Type for creating a new review — all required fields except completedAt
 * (which is set when the review finishes).
 */
export type CreateReviewInput = Omit<ReviewItem, 'completedAt' | 'commentId'>;

/**
 * Type for updating a review's status — partial update to an existing item.
 */
export type UpdateReviewInput = ReviewKey & {
  status: ReviewStatus;
  commentId?: number;
  completedAt?: string;
};

