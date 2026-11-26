import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { club } from "./club"
import { utcNow } from "./timestamps"

// The clubs a user belongs to. Every user except a platform super-admin has at
// least one; super-admins have none and operate across all clubs. The earliest
// membership (created_at, then club_id) is the user's default club, the one they
// act within until they switch.
export const clubMember = pgTable(
  "club_member",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").default(utcNow).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.clubId] })]
)

export type ClubMember = typeof clubMember.$inferSelect
