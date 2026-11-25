import { test, expect } from "@playwright/test"
import { waitForHydration } from "./helpers"

test("dashboard renders its overview and today's reservations", async ({
  page,
}) => {
  await page.goto("/")
  await waitForHydration(page)

  await expect(
    page.getByRole("heading", { name: "Panel", level: 1 })
  ).toBeVisible()
  await expect(page.getByText("Ocupación actual")).toBeVisible()
  await expect(page.getByText("Reservas de hoy").first()).toBeVisible()
  // The per-day chart card is the heaviest server-computed section; if stats
  // failed to load this heading wouldn't render.
  await expect(page.getByText("Reservas esta semana")).toBeVisible()
})
