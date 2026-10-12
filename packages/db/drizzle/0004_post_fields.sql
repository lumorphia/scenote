ALTER TABLE "posts" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "taken_on" date;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "recipe" jsonb;