import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NewClassDrawer } from "./new-class-drawer"
import type { ClassData } from "./new-class-drawer"
import {
  createClass,
  createClassSeries,
  updateClass,
} from "@/lib/classes.functions"
import { AppError } from "@/lib/errors"
import { resolveActivityConfig } from "@/lib/activities/config"
import { getTemplate } from "@/lib/activities/templates"
import type { ActivityTemplate } from "@/lib/activities/templates"
import type { ActivityRecord } from "@/lib/activities.functions"
import type { SpaceRecord } from "@/lib/spaces.functions"
import type { CoachRecord } from "@/lib/coaches.functions"

// `vaul` reads computed transforms on pointer events and crashes under jsdom;
// swap the drawer shell for passthroughs so we test the form inside it.
vi.mock("@/components/ui/drawer", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    Drawer: Pass,
    DrawerTrigger: Pass,
    DrawerContent: Pass,
    DrawerHeader: Pass,
    DrawerTitle: Pass,
    DrawerFooter: Pass,
    DrawerClose: Pass,
  }
})

vi.mock("@/lib/classes.functions", () => ({
  createClass: vi.fn(() => Promise.resolve({})),
  createClassSeries: vi.fn(() => Promise.resolve({})),
  updateClass: vi.fn(() => Promise.resolve({})),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function activityOf(templateKey: string, sortOrder: number): ActivityRecord {
  return {
    id: templateKey,
    templateKey,
    name: null,
    active: true,
    sortOrder,
    config: resolveActivityConfig(
      getTemplate(templateKey) as ActivityTemplate,
      {}
    ),
  }
}

const padel = activityOf("padel", 0)
const pilates = activityOf("pilates", 1)

const spaces: SpaceRecord[] = [
  {
    id: "court-1",
    name: "Court 1",
    type: "court",
    indoor: true,
    active: true,
    sortOrder: 1,
    activityId: "padel",
  },
  {
    id: "studio-1",
    name: "Studio 1",
    type: "studio",
    indoor: true,
    active: true,
    sortOrder: 1,
    activityId: "pilates",
  },
]

function coachOf(id: string, name: string, activityIds: string[]): CoachRecord {
  return {
    id,
    name,
    phone: "+34 600 000 000",
    birthday: null,
    clubId: "club-1",
    createdAt: new Date(),
    activityIds,
  }
}

const coaches: CoachRecord[] = [
  coachOf("coach-1", "Coach K", ["padel", "pilates"]),
  coachOf("coach-2", "Padel Only", ["padel"]),
]

const pilatesClass: ClassData = {
  id: "class-1",
  activityId: "pilates",
  coachId: "coach-1",
  spaceId: "studio-1",
  date: "2026-03-02",
  startTime: "10:00",
  durationMinutes: 50,
  capacity: 8,
}

function renderDrawer(
  activities: ActivityRecord[],
  coachClass?: ClassData
): void {
  render(
    <NewClassDrawer
      open
      onOpenChange={vi.fn()}
      coaches={coaches}
      courts={spaces}
      activities={activities}
      coachClass={coachClass}
    />
  )
}

describe("NewClassDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("hides the activity picker when only one activity runs classes", () => {
    renderDrawer([padel])
    expect(screen.queryByText("Activity")).not.toBeInTheDocument()
    // Padel lessons have no default capacity.
    expect(screen.getByLabelText("Capacity")).toHaveValue(null)
  })

  it("asks for the activity when several run classes", async () => {
    const user = userEvent.setup()
    renderDrawer([padel, pilates])
    expect(screen.getByText("Activity")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Schedule Class" }))
    expect(await screen.findByText("Activity is required")).toBeInTheDocument()
    expect(createClass).not.toHaveBeenCalled()
  })

  it("saves an edited class with its capacity", async () => {
    const user = userEvent.setup()
    renderDrawer([padel, pilates], pilatesClass)
    expect(screen.getByLabelText("Capacity")).toHaveValue(8)

    await user.click(screen.getByRole("button", { name: "Save Changes" }))
    await waitFor(() =>
      expect(updateClass).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: "class-1",
          spaceId: "studio-1",
          durationMinutes: 50,
          capacity: 8,
        }),
      })
    )
  })

  it("sends no limit when the capacity is cleared", async () => {
    const user = userEvent.setup()
    renderDrawer([padel, pilates], pilatesClass)
    await user.clear(screen.getByLabelText("Capacity"))

    await user.click(screen.getByRole("button", { name: "Save Changes" }))
    await waitFor(() =>
      expect(updateClass).toHaveBeenCalledWith({
        data: expect.objectContaining({ capacity: null }),
      })
    )
  })

  it("rejects a capacity outside 1–500", async () => {
    const user = userEvent.setup()
    renderDrawer([padel, pilates], pilatesClass)
    const capacity = screen.getByLabelText("Capacity")
    await user.clear(capacity)
    await user.type(capacity, "0")

    await user.click(screen.getByRole("button", { name: "Save Changes" }))
    expect(
      await screen.findByText(
        "Enter a number from 1 to 500, or leave it empty for no limit"
      )
    ).toBeInTheDocument()
    expect(updateClass).not.toHaveBeenCalled()
  })
})

describe("NewClassDrawer repeat", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Only Date is faked, so the calendar opens on March 2026 and the
    // 12-month count is stable, while user-event's timers stay real.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-03-01T09:00:00"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const user = () => userEvent.setup()

  // A pilates class on Monday 2 March 2026 at 10:00 for 50 minutes.
  async function fillClass(u: ReturnType<typeof user>) {
    renderDrawer([pilates])
    await u.click(screen.getByRole("combobox", { name: "Coach" }))
    await u.click(await screen.findByRole("option", { name: "Coach K" }))
    await u.click(screen.getByRole("combobox", { name: "Studio" }))
    await u.click(await screen.findByRole("option", { name: "Studio 1" }))
    await u.click(screen.getByRole("button", { name: "Date" }))
    await u.click(
      document.querySelector<HTMLElement>(
        '[data-day="3/2/2026"]'
      ) as HTMLElement
    )
    await u.type(screen.getByLabelText("Start Time"), "10:00")
    await u.click(screen.getByRole("combobox", { name: "Duration" }))
    await u.click(await screen.findByRole("option", { name: "50 min" }))
  }

  async function chooseRepeat(u: ReturnType<typeof user>, name: string) {
    await u.click(screen.getByRole("combobox", { name: "Repeat" }))
    await u.click(await screen.findByRole("option", { name }))
  }

  it("needs a date before it can repeat", () => {
    renderDrawer([pilates])
    expect(screen.getByRole("combobox", { name: "Repeat" })).toBeDisabled()
  })

  it("offers Calendar's presets for the date", async () => {
    const u = user()
    await fillClass(u)
    await u.click(screen.getByRole("combobox", { name: "Repeat" }))
    expect(
      (await screen.findAllByRole("option")).map((o) => o.textContent)
    ).toEqual([
      "Does not repeat",
      "Daily",
      "Weekly on Monday",
      "Monthly on the first Monday",
      "Annually on 2 March",
      "Every weekday (Monday to Friday)",
      "Custom…",
    ])
  })

  it("schedules a single class when it doesn't repeat", async () => {
    const u = user()
    await fillClass(u)
    await u.click(screen.getByRole("button", { name: "Schedule Class" }))
    await waitFor(() =>
      expect(createClass).toHaveBeenCalledWith({
        data: expect.objectContaining({ date: "2026-03-02" }),
      })
    )
    expect(createClassSeries).not.toHaveBeenCalled()
  })

  it("creates a weekly series", async () => {
    const u = user()
    await fillClass(u)
    await chooseRepeat(u, "Weekly on Monday")
    expect(screen.getByText("Starts")).toBeInTheDocument()
    expect(screen.getByText("First 12 months: 53 classes")).toBeInTheDocument()

    await u.click(screen.getByRole("button", { name: "Schedule Class" }))
    await waitFor(() =>
      expect(createClassSeries).toHaveBeenCalledWith({
        data: {
          coachId: "coach-1",
          spaceId: "studio-1",
          startTime: "10:00",
          durationMinutes: 50,
          capacity: 8,
          rule: expect.objectContaining({
            frequency: "weekly",
            weekdays: [1],
            startDate: "2026-03-02",
            until: null,
            count: null,
          }),
        },
      })
    )
    expect(createClass).not.toHaveBeenCalled()
  })

  it("builds a custom rule", async () => {
    const u = user()
    await fillClass(u)
    await chooseRepeat(u, "Custom…")
    const dialog = await screen.findByRole("dialog", {
      name: "Custom recurrence",
    })
    const interval = within(dialog).getByLabelText("Repeat every")
    await u.clear(interval)
    await u.type(interval, "2")
    await u.click(within(dialog).getByRole("button", { name: "Wednesday" }))
    await u.click(within(dialog).getByRole("radio", { name: "After" }))
    const count = within(dialog).getByRole("spinbutton", { name: "After" })
    await u.clear(count)
    await u.type(count, "4")
    await u.click(within(dialog).getByRole("button", { name: "Done" }))

    expect(screen.getByText("4 classes will be created")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Repeat" })).toHaveTextContent(
      "Every 2 weeks on Mon, Wed, 4 times"
    )
  })

  it("keeps at least one weekday on", async () => {
    const u = user()
    await fillClass(u)
    await chooseRepeat(u, "Custom…")
    const dialog = await screen.findByRole("dialog")
    const monday = within(dialog).getByRole("button", { name: "Monday" })
    expect(monday).toHaveAttribute("aria-pressed", "true")
    await u.click(monday)
    expect(monday).toHaveAttribute("aria-pressed", "true")
  })

  it("offers to skip the dates the space is taken on", async () => {
    vi.mocked(createClassSeries).mockRejectedValueOnce(
      // As it arrives from the server: only the message survives.
      new Error(
        new AppError("errors.class.seriesConflicts", {
          dates: "2026-03-09, 2026-03-16",
          count: -1,
          all: "2026-03-09,2026-03-16",
        }).message
      )
    )
    const u = user()
    await fillClass(u)
    await chooseRepeat(u, "Weekly on Monday")
    await u.click(screen.getByRole("button", { name: "Schedule Class" }))

    const alert = await screen.findByRole("alert")
    expect(within(alert).getByText("9 March 2026")).toBeInTheDocument()
    expect(within(alert).getByText("16 March 2026")).toBeInTheDocument()

    await u.click(
      within(alert).getByRole("button", { name: "Skip these dates" })
    )
    await waitFor(() =>
      expect(createClassSeries).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          rule: expect.objectContaining({
            exdates: ["2026-03-09", "2026-03-16"],
          }),
        }),
      })
    )
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
