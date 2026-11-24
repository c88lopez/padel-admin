import {
  pgTable,
  text,
  timestamp,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core"
import { club } from "./club"
import { clubIsolation } from "./club-isolation"

export const stockItem = pgTable(
  "stock_item",
  {
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
  },
  () => [clubIsolation()]
)

export type StockItem = typeof stockItem.$inferSelect
export type NewStockItem = typeof stockItem.$inferInsert
