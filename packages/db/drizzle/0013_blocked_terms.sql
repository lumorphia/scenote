CREATE TABLE "blocked_terms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"term" text NOT NULL,
	"normalized" text NOT NULL,
	"match" text DEFAULT 'contains' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_terms_normalized_idx" ON "blocked_terms" USING btree ("normalized");--> statement-breakpoint
CREATE INDEX "blocked_terms_created_idx" ON "blocked_terms" USING btree ("created_at");