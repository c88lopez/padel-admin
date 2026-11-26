import { utcNow } from "./timestamps"
import {
  pgTable,
  text,
  timestamp,
  integer,
  date,
  index,
} from "drizzle-orm/pg-core"
import { club } from "./club"
import { clubIsolation } from "./club-isolation"
import { player } from "./player"
import { space } from "./space"

export const reservation = pgTable(
  "reservation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    spaceId: text("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "restrict" }),
    // Display snapshot of who the booking is for (free text, as typed).
    player: text("player").notNull(),
    // The matching customer, when the name identifies exactly one.
    customerId: text("customer_id").references(() => player.id, {
      onDelete: "set null",
    }),
    bookedBy: text("booked_by").notNull(),
    date: date("date").notNull(),
    startTime: text("start_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    paymentStatus: text("payment_status").notNull(),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").default(utcNow).notNull(),
  },
  (t) => [
    index("reservation_club_customer_idx").on(t.clubId, t.customerId),
    clubIsolation(),
  ]
)

export type Reservation = typeof reservation.$inferSelect
export type NewReservation = typeof reservation.$inferInsert
