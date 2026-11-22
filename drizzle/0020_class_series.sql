CREATE TABLE "class_series" (
	"id" text PRIMARY KEY NOT NULL,
	"club_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"coach_id" text,
	"space_id" text NOT NULL,
	"start_time" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"capacity" integer,
	"frequency" text NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"weekdays" integer[] DEFAULT '{}' NOT NULL,
	"monthly_by" text,
	"start_date" date NOT NULL,
	"until" date,
	"count" integer,
	"exdates" date[] DEFAULT '{}' NOT NULL,
	"generated_until" date NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "class_series_frequency_check" CHECK ("class_series"."frequency" IN ('daily', 'weekly', 'monthly', 'yearly')),
	CONSTRAINT "class_series_interval_check" CHECK ("class_series"."interval" >= 1),
	CONSTRAINT "class_series_monthly_by_check" CHECK ("class_series"."monthly_by" IN ('day_of_month', 'weekday_of_month', 'last_weekday_of_month')),
	CONSTRAINT "class_series_weekdays_check" CHECK ("class_series"."weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]),
	CONSTRAINT "class_series_end_check" CHECK ("class_series"."until" IS NULL OR "class_series"."count" IS NULL),
	CONSTRAINT "class_series_count_check" CHECK ("class_series"."count" IS NULL OR "class_series"."count" >= 1)
);
--> statement-breakpoint
ALTER TABLE "coach_class" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "coach_class" ADD COLUMN "series_date" date;--> statement-breakpoint
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_coach_id_coach_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coach"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_series_club_idx" ON "class_series" USING btree ("club_id");--> statement-breakpoint
ALTER TABLE "coach_class" ADD CONSTRAINT "coach_class_series_id_class_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."class_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_class" ADD CONSTRAINT "coach_class_series_date_unique" UNIQUE("series_id","series_date");