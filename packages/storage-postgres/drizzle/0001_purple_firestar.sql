ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "agent_kind" text;