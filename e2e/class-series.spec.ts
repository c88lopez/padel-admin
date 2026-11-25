import { test, expect } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"
import {
  openDrawer,
  pickCalendarDay,
  selectFirstOption,
  selectOption,
  waitForHydration,
  workerCourt,
  openRowMenu,
} from "./helpers"

// A repeating class from a Monday at least 30 days out, past the days the
// other class and reservation tests use, on this worker's court at 15:00.
// A retry (which reuses the database) or a --repeat-each run moves 18 days
// on, past the 17 days a series spans, and stays within the 12 months
// classes are created for.
async function seriesDates(page: Page) {
  const { retry, repeatEachIndex } = test.info()
  const offset = 30 + 18 * (retry + 3 * repeatEachIndex)
  return page.evaluate((daysAhead) => {
    const monday = new Date()
    monday.setDate(monday.getDate() + daysAhead)
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1)
    // Every 2 weeks on Monday and Wednesday, 4 times.
    const dates = [0, 2, 14, 16].map((n) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + n)
      return d.toLocaleDateString("sv-SE")
    })
    return { dateKey: monday.toLocaleDateString(), dates }
  }, offset)
}

// The class on that date in this worker's court, found through the search
// so it isn't on a later page. Skips the demo seed's weekly 07:00 series,
// which runs on the last court: a worker's court too.
async function classRow(
  page: Page,
  court: string,
  date: string
): Promise<Locator> {
  await page.getByPlaceholder("Buscar clases...").fill(date)
  return page
    .getByRole("row", { name: new RegExp(court) })
    .filter({ hasText: date })
    .filter({ hasNotText: "07:00" })
}

// Picks a row menu item and waits for what it opens. Retried: the list
// re-renders after each change, which can close the menu under the click.
async function openFromRow(
  page: Page,
  row: Locator,
  item: string,
  opened: Locator
): Promise<void> {
  await expect(async () => {
    if (await opened.isVisible()) return
    await page.keyboard.press("Escape")
    await openRowMenu(page, row)
    await page.getByRole("menuitem", { name: item }).click({ timeout: 2000 })
    await expect(opened).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
}

test("repeats a class, signs up to all, edits and deletes with scopes", async ({
  page,
}) => {
  // The whole scenario in one test: longer than the default timeout.
  test.setTimeout(90_000)
  const { dateKey, dates } = await seriesDates(page)
  const court = workerCourt()

  await page.goto("/coaches/classes")
  await waitForHydration(page)
  const drawer = await openDrawer(page, "Nueva clase")
  await selectFirstOption(page, drawer, "Entrenador")
  await selectOption(page, drawer, "Pista", court)
  await pickCalendarDay(page, drawer, dateKey)
  await drawer.getByLabel("Hora de inicio").fill("15:00")
  await selectOption(page, drawer, "Duración", "1 hora")

  await drawer.getByLabel("Repetir", { exact: true }).click()
  await page.getByRole("option", { name: "Personalizar…" }).click()
  const custom = page.getByRole("dialog", { name: "Repetición personalizada" })
  await custom.getByLabel("Repetir cada").fill("2")
  await custom.getByRole("button", { name: "miércoles" }).click()
  await custom.getByRole("radio", { name: "Después de" }).click()
  await custom.getByRole("spinbutton", { name: "Después de" }).fill("4")
  await custom.getByRole("button", { name: "Listo" }).click()
  await expect(custom).toBeHidden()
  await expect(drawer.getByText("Se crearán 4 clases")).toBeVisible()
  await drawer.getByRole("button", { name: "Programar clase" }).click()
  await expect(page.getByText("Clase recurrente programada")).toBeVisible()
  await expect(drawer).toBeHidden()

  for (const date of dates) {
    const row = await classRow(page, court, date)
    await expect(row).toContainText("15:00")
    await expect(
      row.getByRole("img", { name: "Clase recurrente" })
    ).toBeVisible()
  }

  // Sign a customer up to all four.
  const attendees = page.getByRole("dialog", { name: "Inscriptos" })
  await openFromRow(
    page,
    await classRow(page, court, dates[0]),
    "Inscriptos",
    attendees
  )
  await selectFirstOption(page, attendees, "Elige un cliente")
  await attendees
    .getByRole("checkbox", {
      name: "También todas las clases siguientes de la serie",
    })
    .check()
  await attendees.getByRole("button", { name: "Agregar", exact: true }).click()
  await expect(page.getByText(/inscripto en 4 clases$/)).toBeVisible()
  await attendees.getByRole("button", { name: "Cerrar" }).click()
  await expect(attendees).toBeHidden()
  await expect(
    (await classRow(page, court, dates[3])).getByRole("cell", {
      name: "1",
      exact: true,
    })
  ).toBeVisible()

  // Move the rest of the series (from the second class) to 16:00.
  const edit = page.getByRole("dialog", { name: "Editar clase" })
  await openFromRow(page, await classRow(page, court, dates[1]), "Editar", edit)
  await edit.getByLabel("Hora de inicio").fill("16:00")
  await edit.getByRole("button", { name: "Guardar cambios" }).click()
  const editScope = page.getByRole("alertdialog", {
    name: "Editar clase recurrente",
  })
  await editScope
    .getByRole("radio", { name: "Esta clase y las siguientes" })
    .click()
  await editScope.getByRole("button", { name: "Aceptar" }).click()
  await expect(page.getByText("Clase actualizada")).toBeVisible()
  await expect(page.getByRole("dialog")).toBeHidden()

  await expect(await classRow(page, court, dates[0])).toContainText("15:00")
  for (const date of dates.slice(1)) {
    const row = await classRow(page, court, date)
    await expect(row).toContainText("16:00")
    // Moved in place, so the sign-up stayed.
    await expect(
      row.getByRole("cell", { name: "1", exact: true })
    ).toBeVisible()
  }

  // Delete the third class on its own.
  const deleteScope = page.getByRole("alertdialog", {
    name: "Eliminar clase recurrente",
  })
  await openFromRow(
    page,
    await classRow(page, court, dates[2]),
    "Eliminar",
    deleteScope
  )
  await expect(
    deleteScope.getByRole("radio", { name: "Esta clase", exact: true })
  ).toBeChecked()
  await deleteScope.getByRole("button", { name: "Eliminar" }).click()
  // While the dialog is open the list is hidden from role queries, and the
  // toast comes once the list has reloaded: acting on a row mid-reload loses
  // what it opened.
  await expect(deleteScope).toBeHidden()
  await expect(page.getByText("Clase eliminada")).toBeVisible()
  await expect(await classRow(page, court, dates[2])).toHaveCount(0)
  await expect(await classRow(page, court, dates[3])).toHaveCount(1)

  // Then the rest, from the second class on.
  await openFromRow(
    page,
    await classRow(page, court, dates[1]),
    "Eliminar",
    deleteScope
  )
  await deleteScope
    .getByRole("radio", { name: "Esta clase y las siguientes" })
    .click()
  await deleteScope.getByRole("button", { name: "Eliminar" }).click()
  await expect(deleteScope).toBeHidden()
  await expect(await classRow(page, court, dates[1])).toHaveCount(0)
  await expect(await classRow(page, court, dates[3])).toHaveCount(0)
  await expect(await classRow(page, court, dates[0])).toHaveCount(1)
})
