import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NewPlayerDrawer } from "./new-player-drawer"
import { createPlayer, updatePlayer } from "@/lib/players.functions"
import { NO_LEVELS } from "@/lib/activities/levels"
import { getTemplate } from "@/lib/activities/templates"
import type { CustomerView } from "@/hooks/use-customer-view"

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

vi.mock("@/lib/players.functions", () => ({
  createPlayer: vi.fn(() => Promise.resolve({})),
  updatePlayer: vi.fn(() => Promise.resolve({})),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function viewFor(templateKey: "padel" | "pilates"): CustomerView {
  const template = getTemplate(templateKey)
  if (!template) throw new Error(templateKey)
  return {
    activity: {
      id: `${templateKey}-id`,
      templateKey,
      name: null,
      active: true,
    },
    levelScale: template.levels ?? NO_LEVELS,
    text: (key) => template.customers[key],
  }
}

const padel = viewFor("padel")

const existingPlayer = {
  id: "player-1",
  fullName: "John Smith",
  email: "john@example.com",
  phone: "+54 9 11 5000 0000",
  age: 40,
  gender: "Male" as const,
  category: "C4",
}

describe("NewPlayerDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("validates required fields before creating", async () => {
    const user = userEvent.setup()
    render(<NewPlayerDrawer view={padel} open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Agregar jugador" }))

    expect(
      await screen.findByText("El nombre completo es obligatorio")
    ).toBeInTheDocument()
    expect(createPlayer).not.toHaveBeenCalled()
  })

  it("keeps category disabled until a gender is chosen and scopes its options", async () => {
    const user = userEvent.setup()
    render(<NewPlayerDrawer view={padel} open onOpenChange={vi.fn()} />)

    const [genderTrigger, categoryTrigger] = screen.getAllByRole("combobox")
    expect(categoryTrigger).toBeDisabled()

    await user.click(genderTrigger)
    await user.click(await screen.findByRole("option", { name: "Femenino" }))

    const enabledCategory = screen.getAllByRole("combobox")[1]
    expect(enabledCategory).toBeEnabled()

    await user.click(enabledCategory)
    // Female players get the D-series categories, not the male C-series.
    expect(
      await screen.findByRole("option", { name: "D8" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "C8" })).not.toBeInTheDocument()
  })

  it("creates a player with the age coerced to a number", async () => {
    const user = userEvent.setup()
    render(<NewPlayerDrawer view={padel} open onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText("Nombre completo"), "Jane Doe")
    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "jane@example.com"
    )
    await user.type(screen.getByLabelText("Teléfono"), "+54 9 11 5011 1222")
    await user.type(screen.getByLabelText("Edad"), "28")

    const [genderTrigger] = screen.getAllByRole("combobox")
    await user.click(genderTrigger)
    await user.click(await screen.findByRole("option", { name: "Masculino" }))

    const categoryTrigger = screen.getAllByRole("combobox")[1]
    await user.click(categoryTrigger)
    await user.click(await screen.findByRole("option", { name: "C5" }))

    await user.click(screen.getByRole("button", { name: "Agregar jugador" }))

    await waitFor(() =>
      expect(createPlayer).toHaveBeenCalledWith({
        data: {
          fullName: "Jane Doe",
          email: "jane@example.com",
          phone: "+54 9 11 5011 1222",
          age: 28,
          gender: "Male",
          category: "C5",
          activityId: "padel-id",
        },
      })
    )
  })

  it("pre-fills fields when editing and saves via updatePlayer", async () => {
    const user = userEvent.setup()
    render(
      <NewPlayerDrawer
        view={padel}
        open
        player={existingPlayer}
        onOpenChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText("Nombre completo")).toHaveValue("John Smith")
    expect(screen.getByLabelText("Edad")).toHaveValue(40)

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }))

    await waitFor(() =>
      expect(updatePlayer).toHaveBeenCalledWith({
        data: {
          id: "player-1",
          fullName: "John Smith",
          email: "john@example.com",
          phone: "+54 9 11 5000 0000",
          age: 40,
          gender: "Male",
          category: "C4",
          activityId: "padel-id",
        },
      })
    )
    expect(createPlayer).not.toHaveBeenCalled()
  })

  it("names pilates customers students and asks for no level", async () => {
    const user = userEvent.setup()
    render(
      <NewPlayerDrawer view={viewFor("pilates")} open onOpenChange={vi.fn()} />
    )

    expect(screen.getByText("Nuevo alumno")).toBeInTheDocument()
    expect(screen.queryByText("Categoría")).not.toBeInTheDocument()

    await user.type(screen.getByLabelText("Nombre completo"), "Lucía Pérez")
    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "lucia@example.com"
    )
    await user.type(screen.getByLabelText("Teléfono"), "+54 9 11 5033 3444")
    await user.type(screen.getByLabelText("Edad"), "35")
    await user.click(screen.getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Femenino" }))
    await user.click(screen.getByRole("button", { name: "Agregar alumno" }))

    await waitFor(() =>
      expect(createPlayer).toHaveBeenCalledWith({
        data: {
          fullName: "Lucía Pérez",
          email: "lucia@example.com",
          phone: "+54 9 11 5033 3444",
          age: 35,
          gender: "Female",
          category: null,
          activityId: "pilates-id",
        },
      })
    )
  })
})
