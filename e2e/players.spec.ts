import { test, expect } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"
import {
  openDrawer,
  openRowMenu,
  selectOption,
  waitForHydration,
} from "./helpers"

// Creates a player through the drawer and returns its unique name so the caller
// can filter to / act on the resulting row.
async function createPlayer(page: Page): Promise<string> {
  const name = `E2E Player ${Date.now()}-${Math.floor(Math.random() * 1e4)}`
  const dialog = await openDrawer(page, "Nuevo jugador")
  await dialog.getByLabel("Nombre completo").fill(name)
  await dialog.getByLabel("Correo electrónico").fill(`p${Date.now()}@e2e.test`)
  await dialog.getByLabel("Teléfono").fill("+54 9 11 5011 1222")
  await dialog.getByLabel("Edad").fill("28")
  await selectOption(page, dialog, "Género", "Masculino")
  await selectOption(page, dialog, "Categoría", "C4")
  await dialog.getByRole("button", { name: "Agregar jugador" }).click()
  await expect(page.getByText("Jugador creado")).toBeVisible()
  return name
}

// Opens /players fresh, filters by unique text (the table paginates at 10 rows),
// and returns the matching row. A fresh load avoids a lingering modal drawer
// (whose auto-close can be cancelled by the post-save reload) hiding the table.
async function findRow(page: Page, text: string): Promise<Locator> {
  await page.goto("/players")
  await waitForHydration(page)
  await page.getByPlaceholder("Buscar jugadores...").fill(text)
  return page.getByRole("row", { name: new RegExp(text) })
}

test("creates a player", async ({ page }) => {
  await page.goto("/players")
  await waitForHydration(page)
  const name = await createPlayer(page)
  await findRow(page, name)
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible()
})

test("edits a player", async ({ page }) => {
  await page.goto("/players")
  await waitForHydration(page)
  const name = await createPlayer(page)

  const row = await findRow(page, name)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Editar" }).click()

  const dialog = page.getByRole("dialog")
  const updated = `${name} edited`
  await dialog.getByLabel("Nombre completo").fill(updated)
  await dialog.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByText("Jugador actualizado")).toBeVisible()

  await findRow(page, updated)
  await expect(
    page.getByRole("cell", { name: updated, exact: true })
  ).toBeVisible()
})

test("deletes a player", async ({ page }) => {
  await page.goto("/players")
  await waitForHydration(page)
  const name = await createPlayer(page)

  const row = await findRow(page, name)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Eliminar" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Eliminar" })
    .click()
  await expect(page.getByText("Jugador eliminado")).toBeVisible()

  await findRow(page, name)
  await expect(page.getByRole("cell", { name, exact: true })).toHaveCount(0)
})
