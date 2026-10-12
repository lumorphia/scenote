CREATE TABLE "lumorphia_account_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"sub" text NOT NULL,
	"revision" integer NOT NULL,
	"state" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "lumorphia_account_events_sub_idx" ON "lumorphia_account_events" USING btree ("sub","revision");