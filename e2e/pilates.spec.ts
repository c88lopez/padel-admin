import { test, expect } from "@playwright/test"
import {
  PLATFORM_API_KEY,
  openDrawer,
  selectOption,
  waitForHydration,
} from "./helpers"

// North Branch (seeded), where pilates is enabled next to padel. The other
// specs use the Default Club, so its activities stay padel-only.
const NORTH_CLUB_ID = "00000000-0000-0000-0000-000000000002"

test.beforeEach(async ({ page, request, baseURL }) => {
  const res = await request.put(
    `/api/platform/clubs/${NORTH_CLUB_ID}/activities/pilates`,
    {
      headers: { authorization: `Bearer ${PLATFORM_API_KEY}` },
      data: { active: true },
    }
  )
  expect(res.status()).toBe(200)
  // Work in North Branch for this test only (the switcher sets this cookie).
  await page
    .context()
    .addCookies([
      { name: "active_club_id", value: NORTH_CLUB_ID, url: baseURL ?? "" },
    ])
})

test("a club with pilates gets a studio", async ({ page }) => {
  await page.goto("/settings/spaces")
  await waitForHydration(page)

  await expect(page.getByRole("heading", { name: "Pilates" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Agregar sala" })).toBeVisible()
  const names = await page
    .getByLabel("Nombre", { exact: true })
    .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value))
  expect(names).toContain("Studio 1")
})

test("classes and coaches pick between padel and pilates", async ({ page }) => {
  await page.goto("/coaches/classes")
  await waitForHydration(page)
  // Two activities run classes: the list filters by activity, and a new
  // class asks for one.
  await expect(page.getByLabel("Actividad")).toBeVisible()
  const dialog = await openDrawer(page, "Nueva clase")
  await expect(dialog.getByText("Actividad", { exact: true })).toBeVisible()

  await page.goto("/coaches")
  await waitForHydration(page)
  await expect(page.getByRole("columnheader", { name: "Enseña" })).toBeVisible()
})

test("pilates customers are students, listed apart from players", async ({
  page,
}) => {
  await page.goto("/")
  await waitForHydration(page)
  const sidebar = page.locator('[data-sidebar="content"]')
  await expect(
    sidebar.locator('[data-sidebar="group-label"]', { hasText: "Pilates" })
  ).toBeVisible()
  await sidebar.getByRole("link", { name: "Alumnos", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Alumnos" })).toBeVisible()

  const name = `E2E Student ${Date.now()}`
  const dialog = await openDrawer(page, "Nuevo alumno")
  await dialog.getByLabel("Nombre completo").fill(name)
  await dialog.getByLabel("Correo electrónico").fill(`s${Date.now()}@e2e.test`)
  await dialog.getByLabel("Teléfono").fill("+54 9 11 5055 5666")
  await dialog.getByLabel("Edad").fill("41")
  // Pilates has no levels, so there's no category to pick.
  await expect(dialog.getByText("Categoría")).toHaveCount(0)
  await selectOption(page, dialog, "Género", "Femenino")
  await dialog.getByRole("button", { name: "Agregar alumno" }).click()
  await expect(page.getByText("Alumno creado")).toBeVisible()

  await page.reload()
  await waitForHydration(page)
  await page.getByPlaceholder("Buscar alumnos...").fill(name)
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible()

  // Not a padel player.
  await sidebar.getByRole("link", { name: "Jugadores", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Jugadores" })).toBeVisible()
  await page.getByPlaceholder("Buscar jugadores...").fill(name)
  await expect(page.getByRole("cell", { name, exact: true })).toHaveCount(0)
})
