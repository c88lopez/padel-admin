CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"club_id" text NOT NULL,
	"template_key" text NOT NULL,
	"name" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "activity_club_id_template_key_unique" UNIQUE("club_id","template_key")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: every existing club offers padel (the only activity before this
-- migration). Carry over the club's default booking length as the padel
-- booking default. Databases baselined without running this get the same row
-- at runtime from ensureDefaultActivities().
INSERT INTO "activity" ("id", "club_id", "template_key", "active", "sort_order", "config", "created_at")
SELECT
	gen_random_uuid()::text,
	c."id",
	'padel',
	true,
	0,
	jsonb_build_object(
		'bookings',
		jsonb_build_object('defaultDuration', coalesce(s."default_booking_length", 90))
	),
	now()
FROM "club" c
LEFT JOIN "club_reservation_settings" s ON s."club_id" = c."id"
ON CONFLICT ("club_id", "template_key") DO NOTHING;
