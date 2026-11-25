import { test, expect } from "@playwright/test"
import { waitForHydration } from "./helpers"

test("assistant panel overlays the page and survives navigation", async ({
  page,
}) => {
  await page.goto("/")
  await waitForHydration(page)

  const panel = page.getByRole("dialog", { name: "Asistente IA" })
  await page.getByRole("button", { name: "Abrir asistente IA" }).click()
  await expect(panel).toBeVisible()

  // Non-modal: the page behind stays interactive while the panel is open.
  const draft = "players under 30"
  await panel.getByPlaceholder("Pregunta al asistente…").fill(draft)
  await page.getByRole("link", { name: "Jugadores" }).first().click()
  // The sidebar links to the padel players (`?activity=<id>`).
  await expect(page).toHaveURL(/\/players\?activity=/)

  await expect(panel).toBeVisible()
  await expect(panel.getByPlaceholder("Pregunta al asistente…")).toHaveValue(
    draft
  )

  await panel.getByRole("button", { name: "Cerrar asistente" }).click()
  await expect(panel).toBeHidden()
})
