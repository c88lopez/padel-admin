import { test, expect } from "@playwright/test"
import { PLATFORM_API_KEY, openDrawer, waitForHydration } from "./helpers"

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
  await expect(page.getByRole("button", { name: "Add studio" })).toBeVisible()
  const names = await page
    .getByLabel("Name", { exact: true })
    .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value))
  expect(names).toContain("Studio 1")
})

test("classes and coaches pick between padel and pilates", async ({ page }) => {
  await page.goto("/coaches/classes")
  await waitForHydration(page)
  // Two activities run classes: the list filters by activity, and a new
  // class asks for one.
  await expect(page.getByLabel("Activity")).toBeVisible()
  const dialog = await openDrawer(page, "New Class")
  await expect(dialog.getByText("Activity", { exact: true })).toBeVisible()

  await page.goto("/coaches")
  await waitForHydration(page)
  await expect(
    page.getByRole("columnheader", { name: "Teaches" })
  ).toBeVisible()
})
