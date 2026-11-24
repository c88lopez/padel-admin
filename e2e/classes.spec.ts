import { test, expect } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"
import {
  dateKeyAhead,
  openDrawer,
  pickCalendarDay,
  selectFirstOption,
  selectOption,
  waitForHydration,
  workerCourt,
  openRowMenu,
} from "./helpers"

// Classes can't overlap each other or a reservation on the same space, so
// every test schedules on its own day: from 3 days out (reservation tests and
// the seeded classes use the next two days), one day per test, shifted again
// on a retry (which reuses the database) or a --repeat-each run. Courts are
// per worker, so parallel workers don't share a slot either. Six tests use
// days 3–8; a retry moves to the next six.
interface ClassSlot {
  dateKey: string // for the calendar picker
  date: string // "YYYY-MM-DD", as the classes list shows it
}

async function classSlot(page: Page, testIndex: number): Promise<ClassSlot> {
  const { retry, repeatEachIndex } = test.info()
  const daysAhead = 3 + testIndex + 6 * (retry + 3 * repeatEachIndex)
  return {
    dateKey: await dateKeyAhead(page, daysAhead, false),
    date: await page.evaluate((days) => {
      const d = new Date()
      d.setDate(d.getDate() + days)
      return d.toLocaleDateString("sv-SE")
    }, daysAhead),
  }
}

// Schedules a class on this worker's court on the slot's day.
async function createClass(
  page: Page,
  slot: ClassSlot,
  startTime: string,
  capacity?: string
): Promise<string> {
  await page.goto("/coaches/classes")
  await waitForHydration(page)

  const court = workerCourt()
  const dialog = await openDrawer(page, "New Class")
  await selectFirstOption(page, dialog, "Coach")
  await selectOption(page, dialog, "Court", court)
  await pickCalendarDay(page, dialog, slot.dateKey)
  await dialog.getByLabel("Start Time").fill(startTime)
  await selectOption(page, dialog, "Duration", "1 hour")
  // Padel lessons have no capacity limit unless one is set.
  const capacityField = dialog.getByLabel("Capacity")
  await expect(capacityField).toHaveValue("")
  if (capacity) await capacityField.fill(capacity)
  await dialog.getByRole("button", { name: "Schedule Class" }).click()
  await expect(page.getByText("Class scheduled")).toBeVisible()
  return court
}

// Opens the classes list narrowed to the slot's day (each test has its own,
// so the class isn't on a later page) and returns its row. A class has no unique name, so the row
// is located by court, date and start time.
async function findClassRow(
  page: Page,
  court: string,
  slot: ClassSlot,
  time: string
): Promise<Locator> {
  await page.goto("/coaches/classes")
  await waitForHydration(page)
  await page.getByPlaceholder("Search classes...").fill(slot.date)
  return page
    .getByRole("row", { name: new RegExp(court) })
    .filter({ hasText: slot.date })
    .filter({ hasText: time })
}

test("schedules a class", async ({ page }) => {
  await createClass(page, await classSlot(page, 0), "20:00")
})

test("schedules a class with a capacity", async ({ page }) => {
  const slot = await classSlot(page, 1)
  const time = "10:00"
  const court = await createClass(page, slot, time, "4")

  const row = await findClassRow(page, court, slot, time)
  await expect(
    row.getByRole("cell", { name: "0 / 4", exact: true })
  ).toBeVisible()
})

test("signs a customer up until the class is full", async ({ page }) => {
  const slot = await classSlot(page, 2)
  const time = "10:00"
  const court = await createClass(page, slot, time, "1")

  const row = await findClassRow(page, court, slot, time)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Attendees" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("0 of 1 places taken")).toBeVisible()
  await selectFirstOption(page, dialog, "Choose a customer")
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(page.getByText(/signed up$/)).toBeVisible()
  await expect(dialog.getByText("1 of 1 places taken")).toBeVisible()
  await expect(dialog.getByText("This class is full.")).toBeVisible()

  await dialog.getByRole("button", { name: "Close" }).click()
  await expect(
    row.getByRole("cell", { name: "1 / 1", exact: true })
  ).toBeVisible()
})

test("edits a scheduled class", async ({ page }) => {
  const slot = await classSlot(page, 3)
  const time = "10:00"
  const court = await createClass(page, slot, time)

  const row = await findClassRow(page, court, slot, time)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Edit" }).click()

  const newTime = "12:00"
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Start Time").fill(newTime)
  await dialog.getByRole("button", { name: "Save Changes" }).click()
  await expect(page.getByText("Class updated")).toBeVisible()

  await expect(
    (await findClassRow(page, court, slot, newTime)).first()
  ).toBeVisible()
})

test("cancels a scheduled class", async ({ page }) => {
  const slot = await classSlot(page, 4)
  const time = "10:00"
  const court = await createClass(page, slot, time)

  const row = await findClassRow(page, court, slot, time)
  await openRowMenu(page, row)
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click()
  await expect(page.getByText("Class deleted")).toBeVisible()

  await expect(await findClassRow(page, court, slot, time)).toHaveCount(0)
})

test("won't schedule two classes at once in a space", async ({ page }) => {
  const slot = await classSlot(page, 5)
  const court = await createClass(page, slot, "10:00")

  await page.goto("/coaches/classes")
  await waitForHydration(page)
  const dialog = await openDrawer(page, "New Class")
  await selectFirstOption(page, dialog, "Coach")
  await selectOption(page, dialog, "Court", court)
  await pickCalendarDay(page, dialog, slot.dateKey)
  await dialog.getByLabel("Start Time").fill("10:30")
  await selectOption(page, dialog, "Duration", "1 hour")
  await dialog.getByRole("button", { name: "Schedule Class" }).click()
  await expect(
    page.getByText("There's a class in that space 10:00–11:00.", {
      exact: false,
    })
  ).toBeVisible()
})
