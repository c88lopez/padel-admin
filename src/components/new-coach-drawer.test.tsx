import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NewCoachDrawer } from "./new-coach-drawer"
import { createCoach, updateCoach } from "@/lib/coaches.functions"
import { resolveActivityConfig } from "@/lib/activities/config"
import { getTemplate } from "@/lib/activities/templates"
import type { ActivityTemplate } from "@/lib/activities/templates"
import type { ActivityRecord } from "@/lib/activities.functions"

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

vi.mock("@/lib/coaches.functions", () => ({
  createCoach: vi.fn(() => Promise.resolve({})),
  updateCoach: vi.fn(() => Promise.resolve({})),
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

describe("NewCoachDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("validates required fields before creating", async () => {
    const user = userEvent.setup()
    render(<NewCoachDrawer open onOpenChange={vi.fn()} activities={[padel]} />)

    await user.click(screen.getByRole("button", { name: "Add Coach" }))

    expect(await screen.findByText("Name is required")).toBeInTheDocument()
    expect(createCoach).not.toHaveBeenCalled()
  })

  it("creates a coach without a birthday (sends null)", async () => {
    const user = userEvent.setup()
    render(<NewCoachDrawer open onOpenChange={vi.fn()} activities={[padel]} />)

    await user.type(screen.getByLabelText("Full Name"), "Coach Carter")
    await user.type(screen.getByLabelText("Phone"), "+54 9 11 5000 0000")

    await user.click(screen.getByRole("button", { name: "Add Coach" }))

    await waitFor(() =>
      expect(createCoach).toHaveBeenCalledWith({
        data: {
          name: "Coach Carter",
          phone: "+54 9 11 5000 0000",
          birthday: null,
        },
      })
    )
  })

  it("pre-fills fields when editing and formats the birthday on save", async () => {
    const user = userEvent.setup()
    render(
      <NewCoachDrawer
        open
        coach={{
          id: "coach-1",
          name: "Coach K",
          phone: "+54 9 11 1111 1111",
          birthday: new Date(1990, 4, 15), // local midnight → 1990-05-15
          activityIds: ["padel"],
        }}
        activities={[padel]}
        onOpenChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText("Full Name")).toHaveValue("Coach K")

    await user.click(screen.getByRole("button", { name: "Save Changes" }))

    await waitFor(() =>
      expect(updateCoach).toHaveBeenCalledWith({
        data: {
          id: "coach-1",
          name: "Coach K",
          phone: "+54 9 11 1111 1111",
          birthday: "1990-05-15",
        },
      })
    )
    expect(createCoach).not.toHaveBeenCalled()
  })

  it("hides the activities when only one activity runs classes", () => {
    render(<NewCoachDrawer open onOpenChange={vi.fn()} activities={[padel]} />)
    expect(screen.queryByText("Teaches")).not.toBeInTheDocument()
  })

  it("requires and sends the activities when several run classes", async () => {
    const user = userEvent.setup()
    render(
      <NewCoachDrawer
        open
        onOpenChange={vi.fn()}
        activities={[padel, pilates]}
      />
    )
    await user.type(screen.getByLabelText("Full Name"), "Coach Carter")
    await user.type(screen.getByLabelText("Phone"), "+54 9 11 5000 0000")

    await user.click(screen.getByRole("button", { name: "Add Coach" }))
    expect(
      await screen.findByText("Pick at least one activity this coach teaches.")
    ).toBeInTheDocument()
    expect(createCoach).not.toHaveBeenCalled()

    await user.click(screen.getByRole("switch", { name: "Pilates" }))
    await user.click(screen.getByRole("button", { name: "Add Coach" }))
    await waitFor(() =>
      expect(createCoach).toHaveBeenCalledWith({
        data: expect.objectContaining({ activityIds: ["pilates"] }),
      })
    )
  })
})
