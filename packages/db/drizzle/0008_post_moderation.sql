ALTER TABLE "posts" ADD COLUMN "moderation_state" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "moderation_score" real;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "moderation_labels" jsonb;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "moderated_at" timestamp with time zone;