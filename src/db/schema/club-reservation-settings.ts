import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core"
import type { DayHours, Weekday } from "@/lib/reservation-settings"
import { club } from "./club"
import { clubIsolation } from "./club-isolation"

// Per-club reservation configuration: opening hours + booking rules. One row per
// club (club_id is the PK). Enforced server-side on reservation writes.
export const clubReservationSettings = pgTable(
  "club_reservation_settings",
  {
    clubId: text("club_id")
      .primaryKey()
      .references(() => club.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("Europe/Madrid"),
    hours: jsonb("hours").notNull().$type<Record<Weekday, DayHours>>(),
    slotDuration: integer("slot_duration").notNull().default(60),
    defaultBookingLength: integer("default_booking_length")
      .notNull()
      .default(90),
    minAdvanceHours: integer("min_advance_hours").notNull().default(1),
    maxAdvanceDays: integer("max_advance_days").notNull().default(30),
    cancellationCutoffHours: integer("cancellation_cutoff_hours")
      .notNull()
      .default(24),
    maxConcurrentPerPlayer: integer("max_concurrent_per_player")
      .notNull()
      .default(2),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  () => [clubIsolation()]
)

export type ClubReservationSettings =
  typeof clubReservationSettings.$inferSelect
export type NewClubReservationSettings =
  typeof clubReservationSettings.$inferInsert
