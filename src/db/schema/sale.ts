import {
  pgTable,
  text,
  timestamp,
  integer,
  date,
  doublePrecision,
} from "drizzle-orm/pg-core"
import { club } from "./club"
import { clubIsolation } from "./club-isolation"
import { stockItem } from "./stock-item"

export const sale = pgTable(
  "sale",
  {
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
  },
  () => [clubIsolation()]
)

export type Sale = typeof sale.$inferSelect
export type NewSale = typeof sale.$inferInsert

export const saleItem = pgTable(
  "sale_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    saleId: text("sale_id")
      .notNull()
      .references(() => sale.id, { onDelete: "cascade" }),
    // The sale's club, for row-level security.
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    // Snapshot the product name/price so the sale record stays accurate even if
    // the underlying stock item is later renamed or deleted.
    stockItemId: text("stock_item_id").references(() => stockItem.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
  },
  () => [clubIsolation()]
)

export type SaleItem = typeof saleItem.$inferSelect
export type NewSaleItem = typeof saleItem.$inferInsert
