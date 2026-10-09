import { test, expect } from "@playwright/test"
import { waitForHydration } from "./helpers"

test("lists padel as the club's enabled activity", async ({ page }) => {
  await page.goto("/settings/activities")
  await waitForHydration(page)

  await expect(
    page.getByRole("heading", { name: "Activities", level: 2 })
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "Padel" })).toBeVisible()
  // Enabled state is managed by the app's owners, so it's read-only here.
  await expect(page.getByText("Enabled", { exact: true })).toBeVisible()
  await expect(page.getByRole("switch")).toHaveCount(0)
  await expect(
    page.getByText("Activities are enabled by the app's owners.", {
      exact: false,
    })
  ).toBeVisible()

  // Padel provides every building block, so the full navigation is shown.
  const sidebar = page.locator('[data-sidebar="content"]')
  for (const name of ["Reservations", "Coaches", "Classes", "Tournaments"]) {
    await expect(sidebar.getByRole("link", { name, exact: true })).toBeVisible()
  }
})

test("renames an activity and resets it to the default name", async ({
  page,
}) => {
  await page.goto("/settings/activities")
  await waitForHydration(page)

  const name = page.getByLabel("Display name")
  await name.fill("Pádel Pro")
  await name.blur()
  await expect(page.getByText("Activity renamed")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Pádel Pro" })).toBeVisible()

  await page.reload()
  await waitForHydration(page)
  await expect(page.getByLabel("Display name")).toHaveValue("Pádel Pro")

  // Clearing the name falls back to the template's name.
  await page.getByLabel("Display name").fill("")
  await page.getByLabel("Display name").blur()
  await expect(page.getByRole("heading", { name: "Padel" })).toBeVisible()
})
