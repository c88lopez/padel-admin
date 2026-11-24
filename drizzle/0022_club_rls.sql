-- Every club-scoped table gets row-level security (see drizzle/CLAUDE.md).
-- First the three tables that had no club_id get one, copied from the row
-- they belong to.
ALTER TABLE "sale_item" ADD COLUMN "club_id" text;--> statement-breakpoint
ALTER TABLE "coach_activity" ADD COLUMN "club_id" text;--> statement-breakpoint
ALTER TABLE "coach_class_attendee" ADD COLUMN "club_id" text;--> statement-breakpoint
UPDATE "sale_item" SET "club_id" = "sale"."club_id" FROM "sale" WHERE "sale"."id" = "sale_item"."sale_id";--> statement-breakpoint
UPDATE "coach_activity" SET "club_id" = "coach"."club_id" FROM "coach" WHERE "coach"."id" = "coach_activity"."coach_id";--> statement-breakpoint
UPDATE "coach_class_attendee" SET "club_id" = "coach_class"."club_id" FROM "coach_class" WHERE "coach_class"."id" = "coach_class_attendee"."class_id";--> statement-breakpoint
ALTER TABLE "sale_item" ALTER COLUMN "club_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_activity" ALTER COLUMN "club_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_class_attendee" ALTER COLUMN "club_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_activity" ADD CONSTRAINT "coach_activity_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_class_attendee" ADD CONSTRAINT "coach_class_attendee_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- FORCE: the app's role owns these tables, and owners skip RLS without it.
ALTER TABLE "activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_series" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_series" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "club_reservation_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "club_reservation_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_activity" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_class" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_class" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_class_attendee" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_class_attendee" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_activity_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_activity_profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reservation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reservation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sale" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sale" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sale_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sale_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "space" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "space" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tournament" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tournament" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "club_isolation" ON "activity" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "class_series" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "club_reservation_settings" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "coach" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "coach_activity" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "coach_class" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "coach_class_attendee" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "customer_activity_profile" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "player" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "reservation" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "sale" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "sale_item" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "space" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "stock_item" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "club_isolation" ON "tournament" AS PERMISSIVE FOR ALL TO public USING (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK (club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on');
