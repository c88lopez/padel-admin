import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

// Tenant root. Every domain row belongs to exactly one club. Users belong to
// clubs through club_member.
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
