import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  unique,
} from "drizzle-orm/pg-core"
import { club } from "./club"
import { clubIsolation } from "./club-isolation"

// An activity a club offers (padel, pilates, …). `templateKey` points at a
// code-defined template (src/lib/activities/templates.ts) that supplies the
// building blocks and defaults; `config` holds this club's overrides. Clubs
// enable/disable activities rather than deleting them, so a template appears
// at most once per club.
export const activity = pgTable(
  "activity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    templateKey: text("template_key").notNull(),
    // Club-chosen display name; null uses the template's name.
    name: text("name"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [unique().on(t.clubId, t.templateKey), clubIsolation()]
)

export type Activity = typeof activity.$inferSelect
export type NewActivity = typeof activity.$inferInsert
