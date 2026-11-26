import { utcNow } from "./timestamps"
import {
  pgTable,
  text,
  timestamp,
  integer,
  date,
  index,
  check,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import type {
  Frequency,
  MonthlyBy,
  Weekday as IsoWeekday,
} from "@/lib/recurrence"
import { activity } from "./activity"
import { club } from "./club"
import { clubIsolation } from "./club-isolation"
import { coach } from "./coach"
import { space } from "./space"

// A recurring class: the rule (see src/lib/recurrence.ts) and the fields its
// classes share. Each occurrence is a normal coach_class row, created up to
// generated_until.
export const classSeries = pgTable(
  "class_series",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    // NO ACTION, like coach_class.activity_id.
    activityId: text("activity_id")
      .notNull()
      .references(() => activity.id),
    coachId: text("coach_id").references(() => coach.id, {
      onDelete: "set null",
    }),
    spaceId: text("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "restrict" }),
    startTime: text("start_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    capacity: integer("capacity"),
    frequency: text("frequency").$type<Frequency>().notNull(),
    interval: integer("interval").notNull().default(1),
    // ISO weekdays (1 = Monday), weekly rules only.
    weekdays: integer("weekdays")
      .array()
      .$type<IsoWeekday[]>()
      .notNull()
      .default(sql`'{}'`),
    monthlyBy: text("monthly_by").$type<MonthlyBy>(),
    startDate: date("start_date").notNull(),
    // At most one of until/count; both null = never ends.
    until: date("until"),
    count: integer("count"),
    // Rule dates without a class (deleted on their own or skipped over a
    // conflict), so filling ahead doesn't bring them back.
    exdates: date("exdates")
      .array()
      .notNull()
      .default(sql`'{}'`),
    // Classes exist up to this date.
    generatedUntil: date("generated_until").notNull(),
    createdAt: timestamp("created_at").default(utcNow).notNull(),
  },
  (t) => [
    index("class_series_club_idx").on(t.clubId),
    clubIsolation(),
    check(
      "class_series_frequency_check",
      sql`${t.frequency} IN ('daily', 'weekly', 'monthly', 'yearly')`
    ),
    check("class_series_interval_check", sql`${t.interval} >= 1`),
    check(
      "class_series_monthly_by_check",
      sql`${t.monthlyBy} IN ('day_of_month', 'weekday_of_month', 'last_weekday_of_month')`
    ),
    check(
      "class_series_weekdays_check",
      sql`${t.weekdays} <@ ARRAY[1, 2, 3, 4, 5, 6, 7]`
    ),
    check(
      "class_series_end_check",
      sql`${t.until} IS NULL OR ${t.count} IS NULL`
    ),
    check(
      "class_series_count_check",
      sql`${t.count} IS NULL OR ${t.count} >= 1`
    ),
  ]
)

export type ClassSeries = typeof classSeries.$inferSelect
export type NewClassSeries = typeof classSeries.$inferInsert
