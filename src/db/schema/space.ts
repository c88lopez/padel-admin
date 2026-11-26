import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core"
import { activity } from "./activity"
import { club } from "./club"
import { clubIsolation } from "./club-isolation"
import { utcNow } from "./timestamps"

// A bookable space: a padel court today, later a pilates studio, pool lane or
// football field (`type`). Belongs to exactly one club and one activity.
// `sortOrder` doubles as the human-facing number (1, 2, 3 …) used in labels
// like "Court 3".
export const space = pgTable(
  "space",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    type: text("type").notNull().default("court"),
    indoor: boolean("indoor").notNull().default(true),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    // Nullable until a later contract migration; null means the club's default
    // bookings activity (see spaces.server.ts).
    // NO ACTION (checked at the end of the statement) rather than RESTRICT, so a
    // club delete can cascade to its spaces and activities in any order.
    activityId: text("activity_id").references(() => activity.id),
    createdAt: timestamp("created_at").default(utcNow).notNull(),
  },
  () => [clubIsolation()]
)

export type Space = typeof space.$inferSelect
export type NewSpace = typeof space.$inferInsert
