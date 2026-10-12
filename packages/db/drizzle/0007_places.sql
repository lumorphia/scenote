CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" integer NOT NULL,
	"region_source_id" integer NOT NULL,
	"region_name" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "place_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "place_text" text;--> statement-breakpoint
CREATE UNIQUE INDEX "places_source_idx" ON "places" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "places_region_idx" ON "places" USING btree ("region_source_id");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;