ALTER TABLE "space" ADD COLUMN "indoor" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Backfill: "type" held indoor/outdoor until now. Move that into "indoor", then
-- reuse "type" for the kind of space. Every existing space is a padel court.
UPDATE "space" SET "indoor" = ("type" <> 'outdoor');--> statement-breakpoint
UPDATE "space" SET "type" = 'court';--> statement-breakpoint
ALTER TABLE "space" ALTER COLUMN "type" SET DEFAULT 'court';
