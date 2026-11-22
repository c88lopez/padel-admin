-- A customer now belongs to an activity through customer_activity_profile
-- (padel players, pilates students). Until now every customer was a padel
-- player, so each one joins their club's padel activity, and class attendees
-- also join the activity of the class they signed up to. Clubs that get padel
-- later at runtime get the same from ensureDefaultActivities().
INSERT INTO "customer_activity_profile" ("id", "club_id", "customer_id", "activity_id", "created_at")
SELECT gen_random_uuid()::text, p."club_id", p."id", a."id", now()
FROM "player" p
JOIN "activity" a ON a."club_id" = p."club_id" AND a."template_key" = 'padel'
ON CONFLICT ("customer_id", "activity_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "customer_activity_profile" ("id", "club_id", "customer_id", "activity_id", "created_at")
SELECT DISTINCT ON (att."player_id", c."activity_id")
	gen_random_uuid()::text, c."club_id", att."player_id", c."activity_id", now()
FROM "coach_class_attendee" att
JOIN "coach_class" c ON c."id" = att."class_id"
WHERE c."activity_id" IS NOT NULL
ON CONFLICT ("customer_id", "activity_id") DO NOTHING;
