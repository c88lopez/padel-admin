CREATE TABLE "coach_class_attendee" (
	"class_id" text NOT NULL,
	"player_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "coach_class_attendee_class_id_player_id_pk" PRIMARY KEY("class_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "coach_class_attendee" ADD CONSTRAINT "coach_class_attendee_class_id_coach_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."coach_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_class_attendee" ADD CONSTRAINT "coach_class_attendee_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;