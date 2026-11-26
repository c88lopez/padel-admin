import { pgTable, primaryKey, text, timestamp, date } from "drizzle-orm/pg-core"
import { activity } from "./activity"
import { club } from "./club"
import { clubIsolation } from "./club-isolation"
import { utcNow } from "./timestamps"

export const coach = pgTable(
  "coach",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    birthday: date("birthday"),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").default(utcNow).notNull(),
  },
  () => [clubIsolation()]
)

export type Coach = typeof coach.$inferSelect
export type NewCoach = typeof coach.$inferInsert

// The activities a coach can teach. A class's coach must have its activity.
// Rows stay when an activity is disabled, so re-enabling it restores them.
export const coachActivity = pgTable(
  "coach_activity",
  {
    coachId: text("coach_id")
      .notNull()
      .references(() => coach.id, { onDelete: "cascade" }),
    activityId: text("activity_id")
      .notNull()
      .references(() => activity.id, { onDelete: "cascade" }),
    // The coach's club, for row-level security.
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.coachId, t.activityId] }), clubIsolation()]
)

export type CoachActivity = typeof coachActivity.$inferSelect
