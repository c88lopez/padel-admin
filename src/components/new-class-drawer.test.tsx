import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NewClassDrawer } from "./new-class-drawer"
import type { ClassData } from "@/lib/class-form"
import {
  createClass,
  createClassSeries,
  updateClass,
  updateClassSeries,
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
  updateClassSeries: vi.fn(() => Promise.resolve({ saved: true })),
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
    phone: "+54 9 11 5000 0000",
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

// These tests drive the whole drawer (selects, calendar, dialogs) with
// user-event, and under CI's coverage run the longest ones take about 5s,
// right at Vitest's default timeout.
vi.setConfig({ testTimeout: 15_000 })

describe("NewClassDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("hides the activity picker when only one activity runs classes", () => {
    renderDrawer([padel])
    expect(screen.queryByText("Actividad")).not.toBeInTheDocument()
    // Padel lessons have no default capacity.
    expect(screen.getByLabelText("Capacidad")).toHaveValue(null)
  })

  it("asks for the activity when several run classes", async () => {
    const user = userEvent.setup()
    renderDrawer([padel, pilates])
    expect(screen.getByText("Actividad")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Programar clase" }))
    expect(
      await screen.findByText("La actividad es obligatoria")
    ).toBeInTheDocument()
    expect(createClass).not.toHaveBeenCalled()
  })

  it("saves an edited class with its capacity", async () => {
    const user = userEvent.setup()
    renderDrawer([padel, pilates], pilatesClass)
    expect(screen.getByLabelText("Capacidad")).toHaveValue(8)

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }))
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
    await user.clear(screen.getByLabelText("Capacidad"))

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }))
    await waitFor(() =>
      expect(updateClass).toHaveBeenCalledWith({
        data: expect.objectContaining({ capacity: null }),
      })
    )
  })

  it("rejects a capacity outside 1–500", async () => {
    const user = userEvent.setup()
    renderDrawer([padel, pilates], pilatesClass)
    const capacity = screen.getByLabelText("Capacidad")
    await user.clear(capacity)
    await user.type(capacity, "0")

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }))
    expect(
      await screen.findByText(
        "Ingresa un número del 1 al 500, o déjalo vacío para no poner límite"
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
    await u.click(screen.getByRole("combobox", { name: "Entrenador" }))
    await u.click(await screen.findByRole("option", { name: "Coach K" }))
    await u.click(screen.getByRole("combobox", { name: "Sala" }))
    await u.click(await screen.findByRole("option", { name: "Sala 1" }))
    await u.click(screen.getByRole("button", { name: "Fecha" }))
    await u.click(
      document.querySelector<HTMLElement>(
        '[data-day="3/2/2026"]'
      ) as HTMLElement
    )
    await u.type(screen.getByLabelText("Hora de inicio"), "10:00")
    await u.click(screen.getByRole("combobox", { name: "Duración" }))
    await u.click(await screen.findByRole("option", { name: "50 min" }))
  }

  async function chooseRepeat(u: ReturnType<typeof user>, name: string) {
    await u.click(screen.getByRole("combobox", { name: "Repetir" }))
    await u.click(await screen.findByRole("option", { name }))
  }

  it("needs a date before it can repeat", () => {
    renderDrawer([pilates])
    expect(screen.getByRole("combobox", { name: "Repetir" })).toBeDisabled()
  })

  it("offers Calendar's presets for the date", async () => {
    const u = user()
    await fillClass(u)
    await u.click(screen.getByRole("combobox", { name: "Repetir" }))
    expect(
      (await screen.findAllByRole("option")).map((o) => o.textContent)
    ).toEqual([
      "No se repite",
      "Todos los días",
      "Semanalmente el lunes",
      "Mensualmente el primer lunes",
      "Anualmente el 2 de marzo",
      "Todos los días hábiles (de lunes a viernes)",
      "Personalizar…",
    ])
  })

  it("schedules a single class when it doesn't repeat", async () => {
    const u = user()
    await fillClass(u)
    await u.click(screen.getByRole("button", { name: "Programar clase" }))
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
    await chooseRepeat(u, "Semanalmente el lunes")
    expect(screen.getByText("Empieza")).toBeInTheDocument()
    expect(screen.getByText("Primeros 12 meses: 53 clases")).toBeInTheDocument()

    await u.click(screen.getByRole("button", { name: "Programar clase" }))
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
    await chooseRepeat(u, "Personalizar…")
    const dialog = await screen.findByRole("dialog", {
      name: "Repetición personalizada",
    })
    const interval = within(dialog).getByLabelText("Repetir cada")
    await u.clear(interval)
    await u.type(interval, "2")
    await u.click(within(dialog).getByRole("button", { name: "miércoles" }))
    await u.click(within(dialog).getByRole("radio", { name: "Después de" }))
    const count = within(dialog).getByRole("spinbutton", { name: "Después de" })
    await u.clear(count)
    await u.type(count, "4")
    await u.click(within(dialog).getByRole("button", { name: "Listo" }))

    expect(screen.getByText("Se crearán 4 clases")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Repetir" })).toHaveTextContent(
      "Cada 2 semanas el lun., mié., 4 veces"
    )
  })

  it("keeps at least one weekday on", async () => {
    const u = user()
    await fillClass(u)
    await chooseRepeat(u, "Personalizar…")
    const dialog = await screen.findByRole("dialog")
    const monday = within(dialog).getByRole("button", { name: "lunes" })
    expect(monday).toHaveAttribute("aria-pressed", "true")
    await u.click(monday)
    expect(monday).toHaveAttribute("aria-pressed", "true")
  })

  it("offers to skip the dates the space is taken on", async () => {
    vi.mocked(createClassSeries).mockRejectedValueOnce(
      // As it arrives from the server: only the message survives.
      new Error(
        new AppError(
          "errors.class.seriesConflicts",
          "El espacio está ocupado a esa hora el 2026-03-09, 2026-03-16.",
          { dates: "2026-03-09, 2026-03-16", all: "2026-03-09,2026-03-16" }
        ).message
      )
    )
    const u = user()
    await fillClass(u)
    await chooseRepeat(u, "Semanalmente el lunes")
    await u.click(screen.getByRole("button", { name: "Programar clase" }))

    const alert = await screen.findByRole("alert")
    expect(within(alert).getByText("9 de marzo de 2026")).toBeInTheDocument()
    expect(within(alert).getByText("16 de marzo de 2026")).toBeInTheDocument()

    await u.click(
      within(alert).getByRole("button", { name: "Omitir estas fechas" })
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

describe("NewClassDrawer editing a series' class", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-03-01T09:00:00"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const weeklyOnMonday = {
    frequency: "weekly" as const,
    interval: 1,
    weekdays: [1 as const],
    monthlyBy: null,
    startDate: "2026-03-02",
    until: null,
    count: 6,
    exdates: [],
  }
  const seriesClass: ClassData = {
    ...pilatesClass,
    date: "2026-03-09",
    series: { id: "series-1", rule: weeklyOnMonday },
  }

  async function saveWithScope(
    u: ReturnType<typeof userEvent.setup>,
    scope: string
  ) {
    await u.click(screen.getByRole("button", { name: "Guardar cambios" }))
    const dialog = await screen.findByRole("alertdialog", {
      name: "Editar clase recurrente",
    })
    await u.click(within(dialog).getByRole("radio", { name: scope }))
    await u.click(within(dialog).getByRole("button", { name: "Aceptar" }))
  }

  it("shows the series' repeat", () => {
    renderDrawer([pilates], seriesClass)
    expect(screen.getByRole("combobox", { name: "Repetir" })).toHaveTextContent(
      "Semanalmente el lunes, 6 veces"
    )
  })

  it("saves only this class", async () => {
    const u = userEvent.setup()
    renderDrawer([pilates], seriesClass)
    await saveWithScope(u, "Esta clase")
    await waitFor(() =>
      expect(updateClass).toHaveBeenCalledWith({
        data: expect.objectContaining({ id: "class-1", date: "2026-03-09" }),
      })
    )
    expect(updateClassSeries).not.toHaveBeenCalled()
  })

  it("saves this and following classes with the rule", async () => {
    const u = userEvent.setup()
    renderDrawer([pilates], seriesClass)
    await saveWithScope(u, "Esta clase y las siguientes")
    await waitFor(() =>
      expect(updateClassSeries).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: "class-1",
          scope: "following",
          date: "2026-03-09",
          confirmed: false,
          rule: expect.objectContaining({ weekdays: [1], count: 6 }),
        }),
      })
    )
    expect(updateClass).not.toHaveBeenCalled()
  })

  it("doesn't offer this class alone for a new repeat", async () => {
    const u = userEvent.setup()
    renderDrawer([pilates], seriesClass)
    await u.click(screen.getByRole("combobox", { name: "Repetir" }))
    await u.click(await screen.findByRole("option", { name: "Todos los días" }))
    await u.click(screen.getByRole("button", { name: "Guardar cambios" }))
    const dialog = await screen.findByRole("alertdialog", {
      name: "Editar clase recurrente",
    })
    expect(
      within(dialog).queryByRole("radio", { name: "Esta clase" })
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole("radio", { name: "Esta clase y las siguientes" })
    ).toBeChecked()
  })

  it("asks before removing classes, then confirms", async () => {
    vi.mocked(updateClassSeries).mockResolvedValueOnce({
      saved: false,
      removedClasses: 2,
      removedSignUps: 3,
    })
    const u = userEvent.setup()
    renderDrawer([pilates], seriesClass)
    await saveWithScope(u, "Todas las clases")

    const confirm = await screen.findByRole("alertdialog")
    expect(confirm).toHaveTextContent("2 clases y 3 inscripciones")
    await u.click(
      within(confirm).getByRole("button", { name: "Eliminar y guardar" })
    )
    await waitFor(() =>
      expect(updateClassSeries).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ scope: "all", confirmed: true }),
      })
    )
  })

  it("moves the series' weekday with the date", async () => {
    const u = userEvent.setup()
    renderDrawer([pilates], seriesClass)
    await u.click(screen.getByRole("button", { name: "Fecha" }))
    await u.click(
      document.querySelector<HTMLElement>(
        '[data-day="3/10/2026"]'
      ) as HTMLElement
    )
    expect(screen.getByRole("combobox", { name: "Repetir" })).toHaveTextContent(
      "Semanalmente el martes, 6 veces"
    )
  })
})
