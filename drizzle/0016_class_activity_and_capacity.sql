ALTER TABLE "coach_class" ADD COLUMN "activity_id" text;--> statement-breakpoint
ALTER TABLE "coach_class" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "coach_class" ADD CONSTRAINT "coach_class_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Backfill: a class is for its space's activity. Spaces from before
-- activities (no activity_id) belong to the club's padel activity, the only
-- one classes existed for. Existing classes keep no capacity limit (null).
UPDATE "coach_class" c SET "activity_id" = s."activity_id"
FROM "space" s
WHERE s."id" = c."space_id" AND s."activity_id" IS NOT NULL;--> statement-breakpoint
UPDATE "coach_class" c SET "activity_id" = a."id"
FROM "activity" a
WHERE c."activity_id" IS NULL
	AND a."club_id" = c."club_id"
	AND a."template_key" = 'padel';--> statement-breakpoint
ALTER TABLE "coach_class" ALTER COLUMN "activity_id" SET NOT NULL;
