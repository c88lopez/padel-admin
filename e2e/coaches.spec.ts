import { test, expect } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"
import { openDrawer, openRowMenu, waitForHydration } from "./helpers"

// Creates a coach (no birthday — it's optional) and returns its unique name.
async function createCoach(page: Page): Promise<string> {
  const name = `E2E Coach ${Date.now()}-${Math.floor(Math.random() * 1e4)}`
  const dialog = await openDrawer(page, "Nuevo entrenador")
  await dialog.getByLabel("Nombre completo").fill(name)
  await dialog.getByLabel("Teléfono").fill("+54 9 11 5022 2333")
  await dialog.getByRole("button", { name: "Agregar entrenador" }).click()
  await expect(page.getByText("Entrenador creado")).toBeVisible()
  return name
}

async function findRow(page: Page, name: string): Promise<Locator> {
  await page.goto("/coaches")
  await waitForHydration(page)
  await page.getByPlaceholder("Buscar entrenadores...").fill(name)
  return page.getByRole("row", { name: new RegExp(name) })
}

test("creates and deletes a coach", async ({ page }) => {
  await page.goto("/coaches")
  await waitForHydration(page)
  const name = await createCoach(page)

  const row = await findRow(page, name)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Eliminar" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Eliminar" })
    .click()
  await expect(page.getByText("Entrenador eliminado")).toBeVisible()
})

test("edits a coach", async ({ page }) => {
  await page.goto("/coaches")
  await waitForHydration(page)
  const name = await createCoach(page)

  const row = await findRow(page, name)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Editar" }).click()

  const dialog = page.getByRole("dialog")
  const updated = `${name} edited`
  await dialog.getByLabel("Nombre completo").fill(updated)
  await dialog.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByText("Entrenador actualizado")).toBeVisible()

  await findRow(page, updated)
  await expect(
    page.getByRole("cell", { name: updated, exact: true })
  ).toBeVisible()
})

test("creates a coach without a birthday", async ({ page }) => {
  await page.goto("/coaches")
  await waitForHydration(page)
  const name = await createCoach(page)

  // Birthday is optional; the table renders an em dash when it's missing.
  const row = await findRow(page, name)
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible()
  await expect(row.getByRole("cell", { name: "—" }).first()).toBeVisible()
})
