import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { ClassAttendeesDrawer } from "./class-attendees-drawer"
import { addClassAttendee, removeClassAttendee } from "@/lib/classes.functions"

// `vaul` crashes under jsdom; swap the drawer shell for passthroughs.
vi.mock("@/components/ui/drawer", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    Drawer: Pass,
    DrawerContent: Pass,
    DrawerHeader: Pass,
    DrawerTitle: Pass,
    DrawerDescription: Pass,
    DrawerFooter: Pass,
    DrawerClose: Pass,
  }
})

vi.mock("@/lib/classes.functions", () => ({
  listClassAttendees: vi.fn(() =>
    Promise.resolve([
      { playerId: "p-2", fullName: "Ben", signedUpAt: new Date() },
    ])
  ),
  addClassAttendee: vi.fn(() =>
    Promise.resolve({ classes: 3, full: ["2026-03-16"] })
  ),
  removeClassAttendee: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/players.functions", () => ({
  listPlayers: vi.fn(() =>
    Promise.resolve([
      { id: "p-1", fullName: "Ana" },
      { id: "p-2", fullName: "Ben" },
    ])
  ),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

function renderDrawer(inSeries: boolean) {
  render(
    <ClassAttendeesDrawer
      classId="class-1"
      capacity={8}
      inSeries={inSeries}
      open
      onOpenChange={vi.fn()}
    />
  )
}

const following = "También todas las clases siguientes de la serie"

describe("ClassAttendeesDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("only offers the following classes for a series' class", async () => {
    renderDrawer(false)
    expect(await screen.findByText("Ben")).toBeInTheDocument()
    expect(screen.queryByLabelText(following)).not.toBeInTheDocument()
  })

  it("signs up to the following classes and names the full dates", async () => {
    const user = userEvent.setup()
    renderDrawer(true)
    await user.click(await screen.findByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Ana" }))
    await user.click(screen.getByLabelText(following))
    await user.click(screen.getByRole("button", { name: "Agregar" }))

    await waitFor(() =>
      expect(addClassAttendee).toHaveBeenCalledWith({
        data: { classId: "class-1", playerId: "p-1", following: true },
      })
    )
    expect(toast.warning).toHaveBeenCalledWith("Ana inscripto en 3 clases", {
      description: "Completas, sin inscribir: 16 de marzo de 2026",
    })
  })

  it("removes from the following classes too", async () => {
    const user = userEvent.setup()
    renderDrawer(true)
    await user.click(screen.getByLabelText(following))
    await user.click(
      await screen.findByRole("button", { name: "Quitar a Ben" })
    )
    await waitFor(() =>
      expect(removeClassAttendee).toHaveBeenCalledWith({
        data: { classId: "class-1", playerId: "p-2", following: true },
      })
    )
    expect(toast.success).toHaveBeenCalledWith(
      "Ben quitado de esta clase y las siguientes"
    )
  })
})
