import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  boolean,
  integer,
  date,
  doublePrecision,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core"
import type { DayHours, Weekday } from "@/lib/reservation-settings"

// Better Auth core tables. These match the schema Better Auth's drizzle adapter
// expects for email/password auth. App-domain tables (players, reservations,
// etc.) will be added here in later phases.

// Tenant root. Every domain row belongs to exactly one club. Platform
// super-admins are the only users with a null club_id (they operate across all
// clubs).
export const club = pgTable("club", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
})

export type Club = typeof club.$inferSelect
export type NewClub = typeof club.$inferInsert

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  // App-specific fields (declared as Better Auth additionalFields in auth.ts).
  role: text("role").notNull().default("Front Desk"),
  status: text("status").notNull().default("active"),
  // Null only for platform super-admins.
  clubId: text("club_id").references(() => club.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
})

export type User = typeof user.$inferSelect

// Clubs a user may act within. `user.club_id` remains the user's primary/home
// club (default scope); this join table grants access to additional clubs so an
// Owner can switch between several. Platform super-admins ignore this table —
// they operate across all clubs via a null club_id.
export const clubMember = pgTable(
  "club_member",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.clubId] })]
)

export type ClubMember = typeof clubMember.$inferSelect

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
})

// --- App domain tables ---

// A bookable space: a padel court today, later a pilates studio, pool lane or
// football field (`type`). Belongs to exactly one club and one activity.
// `sortOrder` doubles as the human-facing number (1, 2, 3 …) used in labels
// like "Court 3".
export const space = pgTable("space", {
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
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
})

export type Space = typeof space.$inferSelect
export type NewSpace = typeof space.$inferInsert

// Per-club reservation configuration: opening hours + booking rules. One row per
// club (club_id is the PK). Enforced server-side on reservation writes.
export const clubReservationSettings = pgTable("club_reservation_settings", {
  clubId: text("club_id")
    .primaryKey()
    .references(() => club.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("Europe/Madrid"),
  hours: jsonb("hours").notNull().$type<Record<Weekday, DayHours>>(),
  slotDuration: integer("slot_duration").notNull().default(60),
  defaultBookingLength: integer("default_booking_length").notNull().default(90),
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
})

export type ClubReservationSettings =
  typeof clubReservationSettings.$inferSelect
export type NewClubReservationSettings =
  typeof clubReservationSettings.$inferInsert

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
    // Club-chosen display name; null uses the template's translated name.
    name: text("name"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [unique().on(t.clubId, t.templateKey)]
)

export type Activity = typeof activity.$inferSelect
export type NewActivity = typeof activity.$inferInsert

export const player = pgTable("player", {
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
})

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
  (t) => [unique().on(t.customerId, t.activityId)]
)

export type CustomerActivityProfile =
  typeof customerActivityProfile.$inferSelect

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
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("reservation_club_customer_idx").on(t.clubId, t.customerId)]
)

export type Reservation = typeof reservation.$inferSelect
export type NewReservation = typeof reservation.$inferInsert

export const stockItem = pgTable("stock_item", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: doublePrecision("price").notNull(),
  stock: integer("stock").notNull().default(0),
  // Per-item low-stock threshold: items at or below this are flagged. Defaults
  // to 10 so existing rows and new items have a sensible starting point.
  lowStockThreshold: integer("low_stock_threshold").notNull().default(10),
  clubId: text("club_id")
    .notNull()
    .references(() => club.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
})

export type StockItem = typeof stockItem.$inferSelect
export type NewStockItem = typeof stockItem.$inferInsert

export const sale = pgTable("sale", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  date: date("date").notNull(),
  soldBy: text("sold_by").notNull(),
  clubId: text("club_id")
    .notNull()
    .references(() => club.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
})

export type Sale = typeof sale.$inferSelect
export type NewSale = typeof sale.$inferInsert

export const saleItem = pgTable("sale_item", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  saleId: text("sale_id")
    .notNull()
    .references(() => sale.id, { onDelete: "cascade" }),
  // Snapshot the product name/price so the sale record stays accurate even if
  // the underlying stock item is later renamed or deleted.
  stockItemId: text("stock_item_id").references(() => stockItem.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: doublePrecision("unit_price").notNull(),
})

export type SaleItem = typeof saleItem.$inferSelect
export type NewSaleItem = typeof saleItem.$inferInsert

export const coach = pgTable("coach", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  birthday: date("birthday"),
  clubId: text("club_id")
    .notNull()
    .references(() => club.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
})

export type Coach = typeof coach.$inferSelect
export type NewCoach = typeof coach.$inferInsert

export const coachClass = pgTable("coach_class", {
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
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
})

export type CoachClass = typeof coachClass.$inferSelect
export type NewCoachClass = typeof coachClass.$inferInsert

export const tournament = pgTable("tournament", {
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
})

export type Tournament = typeof tournament.$inferSelect
export type NewTournament = typeof tournament.$inferInsert
