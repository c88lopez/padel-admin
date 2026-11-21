CREATE TABLE "coach_activity" (
	"coach_id" text NOT NULL,
	"activity_id" text NOT NULL,
	CONSTRAINT "coach_activity_coach_id_activity_id_pk" PRIMARY KEY("coach_id","activity_id")
);
--> statement-breakpoint
ALTER TABLE "coach_activity" ADD CONSTRAINT "coach_activity_coach_id_coach_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coach"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_activity" ADD CONSTRAINT "coach_activity_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: every existing coach teaches padel, the only activity classes
-- existed for.
INSERT INTO "coach_activity" ("coach_id", "activity_id")
SELECT c."id", a."id"
FROM "coach" c
JOIN "activity" a ON a."club_id" = c."club_id" AND a."template_key" = 'padel'
ON CONFLICT DO NOTHING;
