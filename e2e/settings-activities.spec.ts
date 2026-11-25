import { test, expect } from "@playwright/test"
import { waitForHydration } from "./helpers"

test("lists padel as the club's enabled activity", async ({ page }) => {
  await page.goto("/settings/activities")
  await waitForHydration(page)

  await expect(
    page.getByRole("heading", { name: "Actividades", level: 2 })
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "Pádel" })).toBeVisible()
  // Enabled state is managed by the app's owners, so it's read-only here.
  await expect(page.getByText("Activada", { exact: true })).toBeVisible()
  await expect(page.getByRole("switch")).toHaveCount(0)
  await expect(
    page.getByText(
      "Las actividades las activan los responsables de la aplicación.",
      {
        exact: false,
      }
    )
  ).toBeVisible()

  // Padel provides every building block, so its sidebar group has every
  // activity section.
  const sidebar = page.locator('[data-sidebar="content"]')
  await expect(
    sidebar.locator('[data-sidebar="group-label"]', { hasText: "Pádel" })
  ).toBeVisible()
  for (const name of ["Reservas", "Entrenadores", "Clases", "Torneos"]) {
    await expect(sidebar.getByRole("link", { name, exact: true })).toBeVisible()
  }
})

test("renames an activity and resets it to the default name", async ({
  page,
}) => {
  await page.goto("/settings/activities")
  await waitForHydration(page)

  const name = page.getByLabel("Nombre visible")
  await name.fill("Pádel Pro")
  await name.blur()
  await expect(page.getByText("Actividad renombrada")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Pádel Pro" })).toBeVisible()

  await page.reload()
  await waitForHydration(page)
  await expect(page.getByLabel("Nombre visible")).toHaveValue("Pádel Pro")

  // Clearing the name falls back to the template's name.
  await page.getByLabel("Nombre visible").fill("")
  await page.getByLabel("Nombre visible").blur()
  await expect(page.getByRole("heading", { name: "Pádel" })).toBeVisible()
})
