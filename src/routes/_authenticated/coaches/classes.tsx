import { useMemo, useState } from "react"
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import { IconPlus, IconRepeat } from "@tabler/icons-react"
import { format } from "date-fns"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTable } from "@/components/data-table"
import { NewClassDrawer } from "@/components/new-class-drawer"
import { ClassAttendeesDrawer } from "@/components/class-attendees-drawer"
import { SeriesScopeDialog } from "@/components/series-scope-dialog"
import { RowActions } from "@/components/row-actions"
import { SpaceTimeline } from "@/components/space-timeline"
import type { TimelineItem } from "@/components/space-timeline"
import { listClasses, deleteClass } from "@/lib/classes.functions"
import type { ClassRecord, SeriesScope } from "@/lib/classes.functions"
import { listCoaches } from "@/lib/coaches.functions"
import type { CoachRecord } from "@/lib/coaches.functions"
import { listSpaces } from "@/lib/spaces.functions"
import { getReservationSettings } from "@/lib/reservation-settings.functions"
import type { SpaceRecord } from "@/lib/spaces.functions"
import { listActivities } from "@/lib/activities.functions"
import type { ActivityRecord } from "@/lib/activities.functions"
import {
  activityDisplayName,
  activityProvides,
  spacesForBlock,
} from "@/lib/activities/templates"
import { spaceNoun, spaceNumberLabel } from "@/lib/activities/spaces"
import { classStatus, formatDuration } from "@/lib/classes"
import type { ClassStatus } from "@/lib/classes"
import { describeRule } from "@/lib/recurrence"
import { useCan } from "@/hooks/use-permissions"

// `?activity=<id>` preselects the activity filter (the sidebar's activity
// groups link here with it).
const activitySearchSchema = z.object({ activity: z.string().optional() })

export const Route = createFileRoute("/_authenticated/coaches/classes")({
  validateSearch: activitySearchSchema,
  loader: async () => {
    const activities = await listActivities()
    return {
      classes: await listClasses(),
      coaches: await listCoaches(),
      // Only spaces whose activity runs classes.
      courts: spacesForBlock(await listSpaces(), activities, "sessions"),
      settings: await getReservationSettings(),
      activities,
    }
  },
  component: ClassesPage,
})

const statusVariant: Record<ClassStatus, "default" | "secondary" | "outline"> =
  {
    Upcoming: "secondary",
    Ongoing: "default",
    Completed: "outline",
  }

// What the class drawers need to offer choices.
interface ClassOptions {
  coaches: CoachRecord[]
  courts: SpaceRecord[]
  activities: ActivityRecord[]
}

function ClassActions({
  coachClass,
  options,
}: {
  coachClass: ClassRecord
  options: ClassOptions
}) {
  const router = useRouter()
  const canManage = useCan("coaches:manage")
  const [editOpen, setEditOpen] = useState(false)
  const [attendeesOpen, setAttendeesOpen] = useState(false)
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false)

  async function handleDelete(scope: SeriesScope = "this") {
    try {
      await deleteClass({ data: { id: coachClass.id, scope } })
      // Reloaded first, so the toast shows with the list already updated.
      await router.invalidate()
      toast.success("Clase eliminada")
    } catch {
      toast.error("No se pudo eliminar la clase", {
        description: "Inténtalo de nuevo.",
      })
    }
  }

  if (!canManage) return null

  return (
    <>
      <NewClassDrawer
        {...options}
        coachClass={coachClass}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => router.invalidate()}
      />
      <ClassAttendeesDrawer
        classId={coachClass.id}
        capacity={coachClass.capacity}
        inSeries={!!coachClass.series}
        open={attendeesOpen}
        onOpenChange={setAttendeesOpen}
        onChanged={() => router.invalidate()}
      />
      <RowActions
        extraItems={[
          {
            label: "Inscriptos",
            onClick: () => setAttendeesOpen(true),
          },
        ]}
        onEdit={() => setEditOpen(true)}
        // A series' class asks which classes to delete instead.
        confirmDelete={!coachClass.series}
        onDelete={() =>
          coachClass.series ? setDeleteScopeOpen(true) : handleDelete()
        }
      />
      {coachClass.series && (
        <SeriesScopeDialog
          open={deleteScopeOpen}
          onOpenChange={setDeleteScopeOpen}
          title="Eliminar clase recurrente"
          actionLabel="Eliminar"
          destructive
          onConfirm={(scope) => void handleDelete(scope)}
        />
      )}
    </>
  )
}

function buildColumns(
  canManage: boolean,
  options: ClassOptions,
  showActivity: boolean
): ColumnDef<ClassRecord>[] {
  const activityName = new Map(
    options.activities.map((a) => [a.id, activityDisplayName(a)])
  )
  const statusLabel: Record<ClassStatus, string> = {
    Upcoming: "Próxima",
    Ongoing: "En curso",
    Completed: "Completada",
  }

  const columns: ColumnDef<ClassRecord>[] = [
    {
      accessorKey: "coachName",
      header: "Entrenador",
    },
    ...(showActivity
      ? [
          {
            id: "activity",
            header: "Actividad",
            accessorFn: (c: ClassRecord) => activityName.get(c.activityId),
          },
        ]
      : []),
    {
      accessorKey: "spaceNumber",
      header: spaceNoun(options.courts),
      cell: ({ row }) =>
        spaceNumberLabel(
          row.original.spaceType,
          row.getValue<number>("spaceNumber")
        ),
    },
    {
      accessorKey: "date",
      header: "Fecha",
      cell: ({ row }) => {
        const { date, series } = row.original
        if (!series) return date
        const skipped = series.rule.exdates.length
        return (
          <span className="inline-flex items-center gap-1.5">
            {date}
            <Tooltip>
              <TooltipTrigger asChild>
                <IconRepeat
                  className="size-4 text-muted-foreground"
                  aria-label="Clase recurrente"
                  role="img"
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{describeRule(series.rule)}</p>
                {skipped > 0 && (
                  <p>
                    {skipped === 1
                      ? `${skipped} fecha omitida`
                      : `${skipped} fechas omitidas`}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </span>
        )
      },
    },
    {
      accessorKey: "startTime",
      header: "Hora",
    },
    {
      id: "duration",
      header: "Duración",
      cell: ({ row }) => formatDuration(row.original.durationMinutes),
    },
    {
      id: "attendees",
      header: "Inscriptos",
      // "2 / 8", or just "2" without a limit.
      accessorFn: (c) =>
        c.capacity === null
          ? String(c.attendeeCount)
          : `${c.attendeeCount} / ${c.capacity}`,
    },
    {
      id: "status",
      header: "Estado",
      meta: { className: "text-center" },
      cell: ({ row }) => {
        const c = row.original
        const status = classStatus(c.date, c.startTime, c.durationMinutes)
        return (
          <div className="flex justify-center">
            <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>
          </div>
        )
      },
    },
  ]

  if (canManage) {
    columns.push({
      id: "actions",
      enableSorting: false,
      meta: { className: "text-right" },
      cell: ({ row }) => (
        <ClassActions coachClass={row.original} options={options} />
      ),
    })
  }

  return columns
}

function ClassesPage() {
  const router = useRouter()
  const canManage = useCan("coaches:manage")
  const { classes, coaches, courts, settings, activities } =
    Route.useLoaderData()
  const options = useMemo(
    () => ({ coaches, courts, activities }),
    [coaches, courts, activities]
  )
  // With several activities that run classes, show and filter by activity.
  const sessionActivities = activities.filter((a) =>
    activityProvides(a, "sessions")
  )
  const showActivity = sessionActivities.length > 1
  const navigate = useNavigate({ from: Route.fullPath })
  const { activity } = Route.useSearch()
  const activityFilter =
    showActivity && activity && sessionActivities.some((a) => a.id === activity)
      ? activity
      : "all"
  function setActivityFilter(value: string) {
    void navigate({
      search: { activity: value === "all" ? undefined : value },
      replace: true,
    })
  }
  const columns = useMemo(
    () => buildColumns(canManage, options, showActivity),
    [canManage, options, showActivity]
  )
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const filtered = classes.filter(
    (c) => activityFilter === "all" || c.activityId === activityFilter
  )
  // Series fill the list with classes, so finished ones can be hidden.
  const [hideCompleted, setHideCompleted] = useState(false)
  const visible = filtered.filter(
    (c) =>
      !(
        hideCompleted &&
        classStatus(c.date, c.startTime, c.durationMinutes) === "Completed"
      )
  )

  const todayISO = format(new Date(), "yyyy-MM-dd")
  const todayClasses: TimelineItem[] = filtered
    .filter((c) => c.date === todayISO)
    .map((c) => ({
      id: c.id,
      spaceId: c.spaceId,
      label: c.coachName,
      startTime: c.startTime,
      durationMinutes: c.durationMinutes,
      detail: `${"Inscriptos"}: ${
        c.capacity === null
          ? c.attendeeCount
          : `${c.attendeeCount} / ${c.capacity}`
      }`,
    }))
  // Courts and studios are both numbered "# N", so with several activities
  // each one gets its own timeline.
  const timelines = showActivity
    ? sessionActivities
        .filter((a) => activityFilter === "all" || a.id === activityFilter)
        .map((a) => ({
          key: a.id,
          title: activityDisplayName(a),
          spaces: courts.filter((s) => s.activityId === a.id),
        }))
    : [{ key: "all", title: null, spaces: courts }]

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Clases</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Clases dirigidas por entrenadores.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Cronograma de hoy</h2>
        {timelines.map((timeline) => (
          <div key={timeline.key} className="flex flex-col gap-2">
            {timeline.title && (
              <h3 className="text-sm font-medium">{timeline.title}</h3>
            )}
            <SpaceTimeline
              items={todayClasses}
              spaces={timeline.spaces}
              settings={settings}
              hoveredId={hoveredId}
              onHover={setHoveredId}
            />
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Todas las clases</h2>
        <DataTable
          columns={columns}
          data={visible}
          searchPlaceholder="Buscar clases..."
          exportFileName="classes"
          onRowHover={(c) => setHoveredId(c ? c.id : null)}
          isRowHighlighted={(c) => c.id === hoveredId}
          action={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 pr-2">
                <Switch
                  id="hide-completed"
                  checked={hideCompleted}
                  onCheckedChange={setHideCompleted}
                />
                <Label htmlFor="hide-completed" className="font-normal">
                  Ocultar completadas
                </Label>
              </div>
              {showActivity && (
                <Select
                  value={activityFilter}
                  onValueChange={setActivityFilter}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-44"
                    aria-label="Actividad"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las actividades</SelectItem>
                    {sessionActivities.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {activityDisplayName(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {canManage && (
                <NewClassDrawer
                  {...options}
                  onSaved={() => router.invalidate()}
                  trigger={
                    <Button size="sm">
                      <IconPlus className="size-4" />
                      {"Nueva clase"}
                    </Button>
                  }
                />
              )}
            </div>
          }
        />
      </section>
    </div>
  )
}
