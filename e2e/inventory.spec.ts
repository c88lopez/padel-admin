import { test, expect } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"
import {
  dateKeyAhead,
  openDrawer,
  pickCalendarDay,
  selectOption,
  waitForHydration,
  openRowMenu,
} from "./helpers"

// Creates a stock item through the drawer and returns its unique name. `stock`
// and `threshold` let callers create low-stock (stock <= threshold) items.
async function createItem(
  page: Page,
  {
    price = 9.5,
    stock = 25,
    threshold = 5,
  }: { price?: number; stock?: number; threshold?: number } = {}
): Promise<string> {
  const name = `E2E Item ${Date.now()}-${Math.floor(Math.random() * 1e4)}`
  const dialog = await openDrawer(page, "Nuevo artículo")
  await dialog.getByLabel("Nombre del producto").fill(name)
  await selectOption(page, dialog, "Categoría", "Bebidas")
  // The price label includes the currency symbol, e.g. "Price ($)".
  await dialog.getByLabel(/^Precio/).fill(String(price))
  await dialog.getByLabel("Stock", { exact: true }).fill(String(stock))
  await dialog.getByLabel("Umbral de stock bajo").fill(String(threshold))
  await dialog.getByRole("button", { name: "Agregar artículo" }).click()
  // Toasts can briefly overlap when creating several items in a row.
  await expect(page.getByText("Artículo creado").first()).toBeVisible()
  // Wait for the drawer to finish closing so a follow-up create can't click the
  // still-animating one.
  await expect(dialog).toBeHidden()
  return name
}

// Opens /inventory fresh and filters to a unique product (the table paginates at
// 10 rows). A fresh load avoids a lingering modal drawer hiding the table.
async function findRow(page: Page, name: string): Promise<Locator> {
  await page.goto("/inventory")
  await waitForHydration(page)
  await page.getByPlaceholder("Buscar productos...").fill(name)
  return page.getByRole("row", { name: new RegExp(name) })
}

test("creates a stock item", async ({ page }) => {
  await page.goto("/inventory")
  await waitForHydration(page)
  const name = await createItem(page)

  await findRow(page, name)
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible()
})

test("edits a stock item", async ({ page }) => {
  await page.goto("/inventory")
  await waitForHydration(page)
  const name = await createItem(page)

  const row = await findRow(page, name)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Editar" }).click()

  const dialog = page.getByRole("dialog")
  const updated = `${name} edited`
  await dialog.getByLabel("Nombre del producto").fill(updated)
  await dialog.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByText("Artículo actualizado")).toBeVisible()

  await findRow(page, updated)
  await expect(
    page.getByRole("cell", { name: updated, exact: true })
  ).toBeVisible()
})

test("deletes a stock item", async ({ page }) => {
  await page.goto("/inventory")
  await waitForHydration(page)
  const name = await createItem(page)

  const row = await findRow(page, name)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Eliminar" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Eliminar" })
    .click()
  await expect(page.getByText("Artículo eliminado")).toBeVisible()

  await findRow(page, name)
  await expect(page.getByRole("cell", { name, exact: true })).toHaveCount(0)
})

test("flags an item below its low-stock threshold", async ({ page }) => {
  await page.goto("/inventory")
  await waitForHydration(page)
  const name = await createItem(page, { stock: 2, threshold: 5 })

  // Reload so the header layout's stock list (which feeds the bell) includes the
  // new low-stock item, then open the notifications drawer.
  await page.goto("/inventory")
  await waitForHydration(page)
  await page.getByRole("button", { name: /Notificaciones/ }).click()
  await expect(page.getByText(`Stock bajo: ${name}`)).toBeVisible()
})

test("records a sale in the sales log", async ({ page }) => {
  await page.goto("/inventory")
  await waitForHydration(page)
  const name = await createItem(page, { stock: 25, threshold: 5 })

  await page.goto("/inventory/sales-log")
  await waitForHydration(page)
  const dialog = await openDrawer(page, "Nueva venta")
  await pickCalendarDay(page, dialog, await dateKeyAhead(page, 0, false))
  // The product option text is "{name} ({stock} in stock)" — match by name.
  await dialog.getByLabel("Producto").click()
  await page.getByRole("option", { name: new RegExp(name) }).click()
  await dialog.getByLabel("Cant.").fill("2")
  await dialog.getByRole("button", { name: "Registrar venta" }).click()
  await expect(page.getByText("Venta registrada")).toBeVisible()

  // Stock should have decremented from 25 to 23.
  const row = await findRow(page, name)
  await expect(row.getByText(/^23 unidades$/)).toBeVisible()
})

test("records a multi-item sale and shows correct data when expanded", async ({
  page,
}) => {
  // Create six distinct products with known prices so subtotals are verifiable.
  // price = 1..6, qty = 2..7 → no subtotal equals its own unit price.
  await page.goto("/inventory")
  await waitForHydration(page)
  const lines: { name: string; price: number; qty: number }[] = []
  for (let i = 0; i < 6; i++) {
    const price = i + 1
    const name = await createItem(page, { price, stock: 50 })
    lines.push({ name, price, qty: i + 2 })
  }

  // Record a single sale containing all six line items.
  await page.goto("/inventory/sales-log")
  await waitForHydration(page)
  const dialog = await openDrawer(page, "Nueva venta")
  await pickCalendarDay(page, dialog, await dateKeyAhead(page, 0, false))
  // The drawer starts with one line; add the other five.
  for (let i = 1; i < lines.length; i++) {
    await dialog.getByRole("button", { name: "Agregar artículo" }).click()
  }
  for (let i = 0; i < lines.length; i++) {
    const block = dialog.locator("div.rounded-md.border.p-3").nth(i)
    await block.getByLabel("Producto").click()
    const option = page.getByRole("option", {
      name: `${lines[i].name} (50 en stock)`,
      exact: true,
    })
    await option.click()
    await option.waitFor({ state: "hidden" })
    await block.getByLabel("Cant.").fill(String(lines[i].qty))
  }
  await dialog.getByRole("button", { name: "Registrar venta" }).click()
  await expect(page.getByText("Venta registrada")).toBeVisible()

  // The collapsed row should summarise the sale: "6 items" and the grand total.
  await page.goto("/inventory/sales-log")
  await waitForHydration(page)
  await page.getByPlaceholder("Buscar ventas...").fill(lines[0].name)
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0)
  const summaryRow = page.getByRole("row", { name: /6 artículos/ })
  await expect(summaryRow).toBeVisible()
  await expect(summaryRow).toContainText(`$${total.toFixed(2)}`)

  // Expand and verify every line's product, quantity, unit price and subtotal.
  // Matching the full row name (exact) asserts all four cells at once and avoids
  // also matching the wrapper row, whose name concatenates the whole sub-table.
  await summaryRow.click()
  for (const line of lines) {
    const unitPrice = `$${line.price.toFixed(2)}`
    const subtotal = `$${(line.price * line.qty).toFixed(2)}`
    const expected = `${line.name} ${line.qty} ${unitPrice} ${subtotal}`
    await expect(
      page.getByRole("row", { name: expected, exact: true })
    ).toBeVisible()
  }
})
