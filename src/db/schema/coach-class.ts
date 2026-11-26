import { utcNow } from "./timestamps"
import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  integer,
  date,
  unique,
} from "drizzle-orm/pg-core"
import { activity } from "./activity"
import { classSeries } from "./class-series"
import { club } from "./club"
import { clubIsolation } from "./club-isolation"
import { coach } from "./coach"
import { player } from "./player"
import { space } from "./space"

export const coachClass = pgTable(
  "coach_class",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    coachId: text("coach_id").references(() => coach.id, {
      onDelete: "set null",
    }),
    spaceId: text("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "restrict" }),
    // The activity the class is for (padel lesson, pilates class). Its space
    // must belong to the same activity.
    // NO ACTION rather than RESTRICT, so a club delete can cascade to its
    // classes and activities in any order.
    activityId: text("activity_id")
      .notNull()
      .references(() => activity.id),
    date: date("date").notNull(),
    startTime: text("start_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    // Most attendees allowed; null = no limit.
    capacity: integer("capacity"),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    // The series the class belongs to (null = a one-off class), and the date
    // the rule gave it: its identity in the series, kept when the class alone is
    // moved to another day.
    seriesId: text("series_id").references(() => classSeries.id, {
      onDelete: "set null",
    }),
    seriesDate: date("series_date"),
    createdAt: timestamp("created_at").default(utcNow).notNull(),
  },
  // One class per series date, so concurrent fills can't double up.
  (t) => [
    unique("coach_class_series_date_unique").on(t.seriesId, t.seriesDate),
    clubIsolation(),
  ]
)

export type CoachClass = typeof coachClass.$inferSelect
export type NewCoachClass = typeof coachClass.$inferInsert

// Customers signed up to a class. Their count can't exceed the class's
// capacity (checked under a row lock on the class, see class-attendees.server.ts).
export const coachClassAttendee = pgTable(
  "coach_class_attendee",
  {
    classId: text("class_id")
      .notNull()
      .references(() => coachClass.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => player.id, { onDelete: "cascade" }),
    // The class's club, for row-level security.
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").default(utcNow).notNull(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.playerId] }), clubIsolation()]
)

export type CoachClassAttendee = typeof coachClassAttendee.$inferSelect
