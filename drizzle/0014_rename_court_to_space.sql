-- "court" is a padel/tennis word; the generic bookable place is a space with a
-- type (court, field, studio, lane, …). Constraints are renamed rather than
-- dropped and re-added so the foreign keys aren't revalidated.
ALTER TABLE "court" RENAME TO "space";--> statement-breakpoint
ALTER TABLE "coach_class" RENAME COLUMN "court_id" TO "space_id";--> statement-breakpoint
ALTER TABLE "reservation" RENAME COLUMN "court_id" TO "space_id";--> statement-breakpoint
ALTER TABLE "space" RENAME CONSTRAINT "court_pkey" TO "space_pkey";--> statement-breakpoint
ALTER TABLE "space" RENAME CONSTRAINT "court_club_id_club_id_fk" TO "space_club_id_club_id_fk";--> statement-breakpoint
ALTER TABLE "space" RENAME CONSTRAINT "court_activity_id_activity_id_fk" TO "space_activity_id_activity_id_fk";--> statement-breakpoint
ALTER TABLE "coach_class" RENAME CONSTRAINT "coach_class_court_id_court_id_fk" TO "coach_class_space_id_space_id_fk";--> statement-breakpoint
ALTER TABLE "reservation" RENAME CONSTRAINT "reservation_court_id_court_id_fk" TO "reservation_space_id_space_id_fk";
