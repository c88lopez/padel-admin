import { useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { IconPlus } from "@tabler/icons-react"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/data-table"
import { NewReservationDrawer } from "@/components/new-reservation-drawer"
import { SpaceTimeline } from "@/components/space-timeline"
import type { TimelineItem } from "@/components/space-timeline"
import { listActivities } from "@/lib/activities.functions"
import { spacesForBlock } from "@/lib/activities/templates"
import { spaceNoun } from "@/lib/activities/spaces"
import { RowActions } from "@/components/row-actions"
import {
  deleteReservation,
  listReservations,
} from "@/lib/reservations.functions"
import type { ReservationListItem } from "@/lib/reservations.functions"
import { listSpaces } from "@/lib/spaces.functions"
import type { SpaceRecord } from "@/lib/spaces.functions"
import { getReservationSettings } from "@/lib/reservation-settings.functions"
import { useCan } from "@/hooks/use-permissions"
import { formatTimeRange, useAppSettings } from "@/lib/app-settings"

export const Route = createFileRoute("/_authenticated/reservations")({
  loader: async () => {
    const activities = await listActivities()
    return {
      reservations: await listReservations(),
      // Only spaces whose activity takes bookings (courts, not studios).
      courts: spacesForBlock(await listSpaces(), activities, "bookings"),
      settings: await getReservationSettings(),
      activities,
    }
  },
  component: ReservationsPage,
})

// Table/timeline row: a reservation plus a derived "HH:MM – HH:MM" range.
type ReservationRow = ReservationListItem & { timeRange: string }

function endTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number)
  const total = h * 60 + m + durationMinutes
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`
}

function buildRange(r: ReservationListItem): string {
  return `${r.startTime} – ${endTime(r.startTime, r.durationMinutes)}`
}

// --- Table columns ---

function TimeCell({ time }: { time: string }) {
  const { general } = useAppSettings()
  return <>{formatTimeRange(time, general.timeFormat)}</>
}

function toReservationData(r: ReservationRow) {
  return {
    id: r.id,
    player: r.player,
    spaceId: r.spaceId,
    date: parseISO(r.date),
    time: r.startTime,
    duration: String(r.durationMinutes),
    paymentStatus: r.paymentStatus,
  }
}

function ReservationActions({
  reservation,
  courts,
}: {
  reservation: ReservationRow
  courts: SpaceRecord[]
}) {
  const router = useRouter()
  const canManage = useCan("reservations:manage")
  const { activities } = Route.useLoaderData()
  const [editOpen, setEditOpen] = useState(false)

  async function handleDelete() {
    try {
      await deleteReservation({ data: { id: reservation.id } })
      toast.success("Reserva eliminada", {
        description: `${reservation.player} · ${reservation.timeRange}`,
      })
      router.invalidate()
    } catch {
      toast.error("No se pudo eliminar la reserva", {
        description: "Inténtalo de nuevo.",
      })
    }
  }

  if (!canManage) return null

  return (
    <>
      <NewReservationDrawer
        reservation={toReservationData(reservation)}
        courts={courts}
        activities={activities}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => router.invalidate()}
      />
      <RowActions onEdit={() => setEditOpen(true)} onDelete={handleDelete} />
    </>
  )
}

const PAYMENT_BADGE: Record<
  string,
  { labelKey: string; variant: "default" | "secondary" | "outline" }
> = {
  paid: { labelKey: "Pagado", variant: "default" },
  partial: {
    labelKey: "Parcial",
    variant: "secondary",
  },
  unpaid: { labelKey: "Sin pagar", variant: "outline" },
}

function buildColumns(courts: SpaceRecord[]): ColumnDef<ReservationRow>[] {
  return [
    {
      accessorKey: "spaceNumber",
      header: spaceNoun(courts),
      cell: ({ row }) => `# ${row.getValue<number>("spaceNumber")}`,
    },
    {
      accessorKey: "player",
      header: "Reservado para",
    },
    {
      accessorKey: "bookedBy",
      header: "Reservado por",
    },
    {
      accessorKey: "timeRange",
      header: "Hora",
      cell: ({ row }) => <TimeCell time={row.getValue<string>("timeRange")} />,
    },
    {
      accessorKey: "paymentStatus",
      header: "Estado",
      meta: { className: "w-[384px] text-center" },
      cell: ({ row }) => {
        const badge =
          PAYMENT_BADGE[row.getValue<string>("paymentStatus")] ??
          PAYMENT_BADGE.unpaid
        return (
          <div className="flex justify-center">
            <Badge variant={badge.variant}>{badge.labelKey}</Badge>
          </div>
        )
      },
    },
    {
      id: "actions",
      enableSorting: false,
      meta: { className: "text-right" },
      cell: ({ row }) => (
        <ReservationActions reservation={row.original} courts={courts} />
      ),
    },
  ]
}

// --- Page ---

function ReservationsPage() {
  const router = useRouter()
  const canManage = useCan("reservations:manage")
  const { reservations, courts, settings, activities } = Route.useLoaderData()
  const columns = useMemo(() => buildColumns(courts), [courts])
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const rows: ReservationRow[] = reservations.map((r) => ({
    ...r,
    timeRange: buildRange(r),
  }))

  const todayISO = format(new Date(), "yyyy-MM-dd")
  const todayReservations: TimelineItem[] = rows
    .filter((r) => r.date === todayISO)
    .map((r) => ({
      id: r.id,
      spaceId: r.spaceId,
      label: r.player,
      startTime: r.startTime,
      durationMinutes: r.durationMinutes,
      detail: r.paymentStatus === "paid" ? undefined : "Sin pagar",
    }))

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reservas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administra las reservas de pistas.
          </p>
        </div>
        {canManage && (
          <NewReservationDrawer
            courts={courts}
            activities={activities}
            onSaved={() => router.invalidate()}
            trigger={
              <Button size="sm">
                <IconPlus className="size-4" />
                {"Nueva reserva"}
              </Button>
            }
          />
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Cronograma de hoy</h2>
        <SpaceTimeline
          items={todayReservations}
          spaces={courts}
          settings={settings}
          hoveredId={hoveredId}
          onHover={setHoveredId}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Todas las reservas</h2>
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Buscar reservas..."
          onRowHover={(r) => setHoveredId(r ? r.id : null)}
          isRowHighlighted={(r) => r.id === hoveredId}
        />
      </section>
    </div>
  )
}
