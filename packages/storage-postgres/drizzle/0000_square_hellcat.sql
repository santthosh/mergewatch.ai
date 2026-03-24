CREATE TABLE IF NOT EXISTS "installation_settings" (
	"installation_id" text PRIMARY KEY NOT NULL,
	"severity_threshold" text DEFAULT 'Low' NOT NULL,
	"comment_types" jsonb DEFAULT '{"syntax":true,"logic":true,"style":true}'::jsonb NOT NULL,
	"max_comments" integer DEFAULT 25 NOT NULL,
	"summary" jsonb DEFAULT '{"prSummary":true,"confidenceScore":true,"issuesTable":true,"diagram":true}'::jsonb NOT NULL,
	"custom_instructions" text DEFAULT '' NOT NULL,
	"comment_header" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "installations" (
	"installation_id" text NOT NULL,
	"repo_full_name" text NOT NULL,
	"installed_at" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_id" text,
	"monitored" boolean DEFAULT true NOT NULL,
	CONSTRAINT "installations_installation_id_repo_full_name_pk" PRIMARY KEY("installation_id","repo_full_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"repo_full_name" text NOT NULL,
	"pr_number_commit_sha" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text NOT NULL,
	"completed_at" text,
	"pr_title" text,
	"pr_author" text,
	"pr_author_avatar" text,
	"head_branch" text,
	"base_branch" text,
	"comment_id" integer,
	"model" text,
	"duration_ms" integer,
	"finding_count" integer,
	"top_severity" text,
	"summary_text" text,
	"diagram_text" text,
	"skip_reason" text,
	"merge_score" integer,
	"merge_score_reason" text,
	"findings" jsonb DEFAULT '[]'::jsonb,
	"feedback" text,
	"reactions" jsonb DEFAULT '{}'::jsonb,
	"installation_id" text,
	"settings_used" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_usd" text,
	CONSTRAINT "reviews_repo_full_name_pr_number_commit_sha_pk" PRIMARY KEY("repo_full_name","pr_number_commit_sha")
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "output_tokens" integer;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "estimated_cost_usd" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_installation_idx" ON "reviews" USING btree ("installation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_pr_idx" ON "reviews" USING btree ("repo_full_name");
