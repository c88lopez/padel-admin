CREATE TABLE "customer_activity_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"club_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"level" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "customer_activity_profile_customer_id_activity_id_unique" UNIQUE("customer_id","activity_id")
);
--> statement-breakpoint
ALTER TABLE "player" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "court" ADD COLUMN "activity_id" text;--> statement-breakpoint
ALTER TABLE "reservation" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "customer_activity_profile" ADD CONSTRAINT "customer_activity_profile_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_activity_profile" ADD CONSTRAINT "customer_activity_profile_customer_id_player_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_activity_profile" ADD CONSTRAINT "customer_activity_profile_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court" ADD CONSTRAINT "court_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_customer_id_player_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."player"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_club_customer_idx" ON "reservation" USING btree ("club_id","customer_id");--> statement-breakpoint
-- Backfill: every existing court belongs to its club's padel activity (the only
-- activity so far). Baselined databases get the same link at runtime from
-- linkUnassignedCourts() in courts.server.ts.
UPDATE "court" SET "activity_id" = a."id"
FROM "activity" a
WHERE a."club_id" = "court"."club_id"
	AND a."template_key" = 'padel'
	AND "court"."activity_id" IS NULL;--> statement-breakpoint
-- Backfill: move each player's padel category into their padel profile.
-- Migration 0013 drops the category column.
INSERT INTO "customer_activity_profile" ("id", "club_id", "customer_id", "activity_id", "level", "created_at")
SELECT gen_random_uuid()::text, p."club_id", p."id", a."id", p."category", now()
FROM "player" p
JOIN "activity" a ON a."club_id" = p."club_id" AND a."template_key" = 'padel'
WHERE p."category" IS NOT NULL
ON CONFLICT ("customer_id", "activity_id") DO NOTHING;--> statement-breakpoint
-- Backfill: link bookings to a customer only when the typed name matches
-- exactly one player in the club (case/whitespace-insensitive). Anything
-- ambiguous or unmatched stays unlinked; the free-text name is kept.
UPDATE "reservation" r SET "customer_id" = m."id"
FROM (
	SELECT "club_id", lower(trim("full_name")) AS "name", min("id") AS "id"
	FROM "player"
	GROUP BY "club_id", lower(trim("full_name"))
	HAVING count(*) = 1
) m
WHERE m."club_id" = r."club_id"
	AND m."name" = lower(trim(r."player"))
	AND r."customer_id" IS NULL;
