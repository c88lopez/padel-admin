import { pgTable, text, timestamp, integer, date } from "drizzle-orm/pg-core"
import { club } from "./club"
import { clubIsolation } from "./club-isolation"

export const tournament = pgTable(
  "tournament",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    date: date("date").notNull(),
    category: text("category").notNull(),
    // One of "round_robin" | "elimination" | "double_elimination".
    format: text("format").notNull(),
    maxTeams: integer("max_teams").notNull(),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  () => [clubIsolation()]
)

export type Tournament = typeof tournament.$inferSelect
export type NewTournament = typeof tournament.$inferInsert
