-- A user's clubs are now only their club_member rows; the earliest one is their
-- default club. Before dropping user.club_id, make sure every home club is a
-- membership and sorts first, so nobody's default club changes.
INSERT INTO "club_member" ("user_id", "club_id", "created_at")
SELECT "id", "club_id", now() FROM "user" WHERE "club_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "club_member" m
SET "created_at" = first."created_at" - interval '1 second'
FROM "user" u,
  LATERAL (
    SELECT min("created_at") AS "created_at"
    FROM "club_member"
    WHERE "user_id" = u."id"
  ) first
WHERE m."user_id" = u."id" AND m."club_id" = u."club_id";
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_club_id_club_id_fk";
--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "club_id";
