import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NewClassDrawer } from "./new-class-drawer"
import type { ClassData } from "./new-class-drawer"
import { createClass, updateClass } from "@/lib/classes.functions"
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
