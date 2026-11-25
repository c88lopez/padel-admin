import { test, expect } from "@playwright/test"
import { waitForHydration, SIGNED_OUT_STATE } from "./helpers"

// These run without the saved admin session.
test.use({ storageState: SIGNED_OUT_STATE })

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/reservations")
  await expect(page).toHaveURL(/\/login$/)
})

test("invalid credentials show an error", async ({ page }) => {
  await page.goto("/login")
  await waitForHydration(page)
  await page.getByLabel("Correo electrónico").fill("admin@club.test")
  await page.getByLabel("Contraseña").fill("definitely-the-wrong-password")
  await page.getByRole("button", { name: "Iniciar sesión" }).click()

  await expect(page.getByText("Correo o contraseña no válidos.")).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test("archived users cannot sign in", async ({ page }) => {
  // Pedro is seeded as an archived user (see src/db/seed.ts). Even with correct
  // credentials, the Better Auth before-hook rejects the sign-in.
  await page.goto("/login")
  await waitForHydration(page)
  await page.getByLabel("Correo electrónico").fill("pedro@padelclub.com")
  await page.getByLabel("Contraseña").fill("padel1234")
  await page.getByRole("button", { name: "Iniciar sesión" }).click()

  await expect(
    page.getByText("Esta cuenta está archivada. Contacta con un administrador.")
  ).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})
