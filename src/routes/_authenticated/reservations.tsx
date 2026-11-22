import { useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
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
import { spaceNounKey } from "@/lib/activities/spaces"
import { RowActions } from "@/components/row-actions"
import {
  deleteReservation,
  listReservations,
} from "@/lib/reservations.functions"
import type { ReservationListItem } from "@/lib/reservations.functions"
import { listSpaces } from "@/lib/spaces.functions"
import type { SpaceRecord } from "@/lib/spaces.functions"
import { getReservationSettings } from "@/lib/reservation-settings.functions"
import type { TranslationKey } from "@/lib/i18n"
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
  const { t } = useTranslation()
  const router = useRouter()
  const canManage = useCan("reservations:manage")
  const { activities } = Route.useLoaderData()
  const [editOpen, setEditOpen] = useState(false)

  async function handleDelete() {
    try {
      await deleteReservation({ data: { id: reservation.id } })
      toast.success(t("pages.reservations.deleted"), {
        description: `${reservation.player} · ${reservation.timeRange}`,
      })
      router.invalidate()
    } catch {
      toast.error(t("pages.reservations.deleteError"), {
        description: t("common.tryAgain"),
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
  { labelKey: TranslationKey; variant: "default" | "secondary" | "outline" }
> = {
  paid: { labelKey: "options.paid", variant: "default" },
  partial: {
    labelKey: "pages.reservations.statusPartial",
    variant: "secondary",
  },
  unpaid: { labelKey: "options.unpaid", variant: "outline" },
}

function buildColumns(
  t: TFunction,
  courts: SpaceRecord[]
): ColumnDef<ReservationRow>[] {
  return [
    {
      accessorKey: "spaceNumber",
      header: t(spaceNounKey(courts)),
      cell: ({ row }) => `# ${row.getValue<number>("spaceNumber")}`,
    },
    {
      accessorKey: "player",
      header: t("pages.reservations.reservedTo"),
    },
    {
      accessorKey: "bookedBy",
      header: t("pages.reservations.reservedBy"),
    },
    {
      accessorKey: "timeRange",
      header: t("pages.reservations.time"),
      cell: ({ row }) => <TimeCell time={row.getValue<string>("timeRange")} />,
    },
    {
      accessorKey: "paymentStatus",
      header: t("common.status"),
      meta: { className: "w-[384px] text-center" },
      cell: ({ row }) => {
        const badge =
          PAYMENT_BADGE[row.getValue<string>("paymentStatus")] ??
          PAYMENT_BADGE.unpaid
        return (
          <div className="flex justify-center">
            <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
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
  const { t } = useTranslation()
  const router = useRouter()
  const canManage = useCan("reservations:manage")
  const { reservations, courts, settings, activities } = Route.useLoaderData()
  const columns = useMemo(() => buildColumns(t, courts), [t, courts])
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
      detail: r.paymentStatus === "paid" ? undefined : t("options.unpaid"),
    }))

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("pages.reservations.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("pages.reservations.description")}
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
                {t("pages.reservations.newButton")}
              </Button>
            }
          />
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          {t("pages.reservations.todaysTimeline")}
        </h2>
        <SpaceTimeline
          items={todayReservations}
          spaces={courts}
          settings={settings}
          hoveredId={hoveredId}
          onHover={setHoveredId}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          {t("pages.reservations.allReservations")}
        </h2>
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder={t("pages.reservations.searchPlaceholder")}
          onRowHover={(r) => setHoveredId(r ? r.id : null)}
          isRowHighlighted={(r) => r.id === hoveredId}
        />
      </section>
    </div>
  )
}
