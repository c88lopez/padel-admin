import { test, expect } from "@playwright/test"
import { waitForHydration } from "./helpers"

test("lists the club's courts under Spaces", async ({ page }) => {
  await page.goto("/settings/spaces")
  await waitForHydration(page)

  await expect(
    page.getByRole("heading", { name: "Spaces", level: 2 })
  ).toBeVisible()
  // The six default padel courts, named after their type.
  const names = page.getByLabel("Name", { exact: true })
  await expect(names.first()).toHaveValue("Court 1")
  await expect(page.getByRole("button", { name: "Add court" })).toBeVisible()
  // Courts moved out of the reservation settings.
  await page.goto("/settings/reservations")
  await waitForHydration(page)
  await expect(page.getByRole("button", { name: "Add court" })).toHaveCount(0)
})

test("adds, renames and deletes a court", async ({ page }) => {
  await page.goto("/settings/spaces")
  await waitForHydration(page)

  const names = page.getByLabel("Name", { exact: true })
  const before = await names.count()
  await page.getByRole("button", { name: "Add court" }).click()
  await expect(names).toHaveCount(before + 1)
  const added = names.last()
  await expect(added).toHaveValue(`Court ${before + 1}`)

  await added.fill("Center Court")
  // The name saves on blur; wait for it before reloading.
  const saved = page.waitForResponse(
    (r) => r.url().includes("/_serverFn/") && r.request().method() === "POST"
  )
  await added.blur()
  await saved
  await page.reload()
  await waitForHydration(page)
  await expect(names.last()).toHaveValue("Center Court")

  await page.getByRole("button", { name: "Remove Center Court" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click()
  await expect(page.getByText("Center Court removed")).toBeVisible()
  await expect(names).toHaveCount(before)
})
