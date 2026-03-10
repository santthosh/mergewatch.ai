import { pgTable, text, integer, jsonb, primaryKey, index } from 'drizzle-orm/pg-core';

export const installations = pgTable('installations', {
  installationId: text('installation_id').notNull(),
  repoFullName: text('repo_full_name').notNull(),
  installedAt: text('installed_at').notNull(),
  config: jsonb('config').notNull().default({}),
  modelId: text('model_id'),
}, (t) => ({
  pk: primaryKey({ columns: [t.installationId, t.repoFullName] }),
}));

export const installationSettings = pgTable('installation_settings', {
  installationId: text('installation_id').primaryKey(),
  severityThreshold: text('severity_threshold').notNull().default('Low'),
  commentTypes: jsonb('comment_types').notNull().default({ syntax: true, logic: true, style: true }),
  maxComments: integer('max_comments').notNull().default(25),
  summary: jsonb('summary').notNull().default({ prSummary: true, confidenceScore: true, issuesTable: true, diagram: true }),
  customInstructions: text('custom_instructions').notNull().default(''),
  commentHeader: text('comment_header').notNull().default(''),
});

export const reviews = pgTable('reviews', {
  repoFullName: text('repo_full_name').notNull(),
  prNumberCommitSha: text('pr_number_commit_sha').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
  prTitle: text('pr_title'),
  prAuthor: text('pr_author'),
  prAuthorAvatar: text('pr_author_avatar'),
  headBranch: text('head_branch'),
  baseBranch: text('base_branch'),
  commentId: integer('comment_id'),
  model: text('model'),
  durationMs: integer('duration_ms'),
  findingCount: integer('finding_count'),
  topSeverity: text('top_severity'),
  summaryText: text('summary_text'),
  diagramText: text('diagram_text'),
  skipReason: text('skip_reason'),
  mergeScore: integer('merge_score'),
  mergeScoreReason: text('merge_score_reason'),
  findings: jsonb('findings').default([]),
  feedback: text('feedback'),
  reactions: jsonb('reactions').default({}),
  installationId: text('installation_id'),
  settingsUsed: jsonb('settings_used'),
}, (t) => ({
  pk: primaryKey({ columns: [t.repoFullName, t.prNumberCommitSha] }),
  installationIdx: index('reviews_installation_idx').on(t.installationId),
  prIdx: index('reviews_pr_idx').on(t.repoFullName),
}));
