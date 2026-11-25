import { test, expect } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"
import { openDrawer, openRowMenu, waitForHydration } from "./helpers"

// A notifications ToggleRow renders the <Switch> and the title <p> as siblings'
// children of the row; from the title go up two levels to reach the switch.
function notifSwitch(page: Page, title: string): Locator {
  return page
    .getByText(title, { exact: true })
    .locator("xpath=../..")
    .getByRole("switch")
}

// A password-policy row renders the <Switch> and label <span> in the same parent.
function policySwitch(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .locator("xpath=..")
    .getByRole("switch")
}

async function findUserRow(page: Page, text: string): Promise<Locator> {
  await page.goto("/settings/users")
  await waitForHydration(page)
  await page.getByPlaceholder("Buscar usuarios...").fill(text)
  return page.getByRole("row", { name: new RegExp(text) })
}

test("general settings persist club profile and regional prefs", async ({
  page,
}) => {
  await page.goto("/settings/general")
  await waitForHydration(page)

  // Phone is stored in per-club localStorage on change (no save button).
  const phone = page.getByLabel("Teléfono")
  await expect(phone).toBeVisible()
  const value = `+54 9 11 ${Date.now() % 100000000}`
  await phone.fill(value)

  // Time format is a toggle-button group; the active one gets border-primary.
  await page.getByRole("button", { name: "12 horas" }).click()

  await page.reload()
  await waitForHydration(page)

  await expect(page.getByLabel("Teléfono")).toHaveValue(value)
  await expect(page.getByRole("button", { name: "12 horas" })).toHaveClass(
    /border-primary/
  )
})

test("notification toggles persist across reloads", async ({ page }) => {
  await page.goto("/settings/notifications")
  await waitForHydration(page)

  const whatsapp = notifSwitch(page, "WhatsApp")
  await expect(whatsapp).toBeVisible()
  const before = await whatsapp.getAttribute("aria-checked")
  const after = before === "true" ? "false" : "true"
  await whatsapp.click()
  await expect(whatsapp).toHaveAttribute("aria-checked", after)

  await page.reload()
  await waitForHydration(page)
  await expect(notifSwitch(page, "WhatsApp")).toHaveAttribute(
    "aria-checked",
    after
  )
})

test("password policy switches persist", async ({ page }) => {
  await page.goto("/settings/users")
  await waitForHydration(page)

  const symbol = policySwitch(page, "Requerir un símbolo")
  await expect(symbol).toBeVisible()
  const before = await symbol.getAttribute("aria-checked")
  const after = before === "true" ? "false" : "true"
  await symbol.click()
  await expect(symbol).toHaveAttribute("aria-checked", after)

  await page.reload()
  await waitForHydration(page)
  await expect(policySwitch(page, "Requerir un símbolo")).toHaveAttribute(
    "aria-checked",
    after
  )
})

test("admin can create, edit, archive, and delete a user", async ({ page }) => {
  await page.goto("/settings/users")
  await waitForHydration(page)

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`
  const name = `E2E User ${suffix}`
  const email = `u${suffix}@e2e.test`.replace(/-/g, "")

  // Create
  const dialog = await openDrawer(page, "Nuevo usuario")
  await dialog.getByLabel("Nombre completo").fill(name)
  await dialog.getByLabel("Correo electrónico").fill(email)
  await dialog.getByLabel("Contraseña temporal").fill("Sup3rSecret1")
  // Non-super-admin users must belong to a club; select the first if the field
  // is shown (depends on the actor's club access).
  const clubButtons = dialog.locator("button[aria-pressed]")
  if (await clubButtons.count()) await clubButtons.first().click()
  await dialog.getByRole("button", { name: "Agregar usuario" }).click()
  await expect(page.getByText("Usuario creado")).toBeVisible()

  // Edit (search by email — stable across the name change)
  const updated = `${name} edited`
  let row = await findUserRow(page, email)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Editar" }).click()
  const editDialog = page.getByRole("dialog")
  await editDialog.getByLabel("Nombre completo").fill(updated)
  await editDialog.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByText("Usuario actualizado")).toBeVisible()

  // Archive
  row = await findUserRow(page, email)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Archivar" }).click()
  await expect(page.getByText("Usuario archivado")).toBeVisible()

  // Delete
  row = await findUserRow(page, email)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Eliminar" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Eliminar" })
    .click()
  await expect(page.getByText("Usuario eliminado")).toBeVisible()

  await findUserRow(page, email)
  await expect(
    page.getByRole("cell", { name: email, exact: true })
  ).toHaveCount(0)
})
