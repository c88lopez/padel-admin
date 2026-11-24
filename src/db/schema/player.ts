import { pgTable, text, timestamp, integer, unique } from "drizzle-orm/pg-core"
import { activity } from "./activity"
import { club } from "./club"
import { clubIsolation } from "./club-isolation"

export const player = pgTable(
  "player",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    age: integer("age").notNull(),
    gender: text("gender").notNull(),
    // The padel level lives in customer_activity_profile.
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  () => [clubIsolation()]
)

export type Player = typeof player.$inferSelect
export type NewPlayer = typeof player.$inferInsert

// Activity-specific data for a customer (one shared customer list per club).
// Holds e.g. the padel level; activities without levels need no row.
export const customerActivityProfile = pgTable(
  "customer_activity_profile",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => player.id, { onDelete: "cascade" }),
    activityId: text("activity_id")
      .notNull()
      .references(() => activity.id, { onDelete: "cascade" }),
    level: text("level"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [unique().on(t.customerId, t.activityId), clubIsolation()]
)

export type CustomerActivityProfile =
  typeof customerActivityProfile.$inferSelect
