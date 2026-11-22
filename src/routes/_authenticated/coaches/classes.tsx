import { useMemo, useState } from "react"
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import type { ColumnDef } from "@tanstack/react-table"
import { IconPlus, IconRepeat } from "@tabler/icons-react"
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
import { RowActions } from "@/components/row-actions"
import { listClasses, deleteClass } from "@/lib/classes.functions"
import type { ClassRecord } from "@/lib/classes.functions"
import { listCoaches } from "@/lib/coaches.functions"
import type { CoachRecord } from "@/lib/coaches.functions"
import { listSpaces } from "@/lib/spaces.functions"
import type { SpaceRecord } from "@/lib/spaces.functions"
import { listActivities } from "@/lib/activities.functions"
import type { ActivityRecord } from "@/lib/activities.functions"
import {
  activityDisplayName,
  activityProvides,
  spacesForBlock,
} from "@/lib/activities/templates"
import { spaceNounKey, spaceNumberLabel } from "@/lib/activities/spaces"
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
  const { t } = useTranslation()
  const router = useRouter()
  const canManage = useCan("coaches:manage")
  const [editOpen, setEditOpen] = useState(false)
  const [attendeesOpen, setAttendeesOpen] = useState(false)

  async function handleDelete() {
    try {
      await deleteClass({ data: { id: coachClass.id } })
      toast.success(t("pages.classes.deleted"))
      router.invalidate()
    } catch {
      toast.error(t("pages.classes.deleteError"), {
        description: t("common.tryAgain"),
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
        open={attendeesOpen}
        onOpenChange={setAttendeesOpen}
        onChanged={() => router.invalidate()}
      />
      <RowActions
        extraItems={[
          {
            label: t("pages.classes.attendees"),
            onClick: () => setAttendeesOpen(true),
          },
        ]}
        onEdit={() => setEditOpen(true)}
        onDelete={handleDelete}
      />
    </>
  )
}

function buildColumns(
  t: TFunction,
  canManage: boolean,
  options: ClassOptions,
  showActivity: boolean
): ColumnDef<ClassRecord>[] {
  const activityName = new Map(
    options.activities.map((a) => [a.id, activityDisplayName(a, t)])
  )
  const statusLabel: Record<ClassStatus, string> = {
    Upcoming: t("pages.classes.statusUpcoming"),
    Ongoing: t("pages.classes.statusOngoing"),
    Completed: t("pages.classes.statusCompleted"),
  }

  const columns: ColumnDef<ClassRecord>[] = [
    {
      accessorKey: "coachName",
      header: t("fields.coach"),
    },
    ...(showActivity
      ? [
          {
            id: "activity",
            header: t("fields.activity"),
            accessorFn: (c: ClassRecord) => activityName.get(c.activityId),
          },
        ]
      : []),
    {
      accessorKey: "spaceNumber",
      header: t(spaceNounKey(options.courts)),
      cell: ({ row }) =>
        spaceNumberLabel(
          row.original.spaceType,
          row.getValue<number>("spaceNumber"),
          t
        ),
    },
    {
      accessorKey: "date",
      header: t("fields.date"),
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
                  aria-label={t("recurrence.repeating")}
                  role="img"
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{describeRule(series.rule, t)}</p>
                {skipped > 0 && (
                  <p>{t("recurrence.skipped", { count: skipped })}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </span>
        )
      },
    },
    {
      accessorKey: "startTime",
      header: t("pages.classes.time"),
    },
    {
      id: "duration",
      header: t("fields.duration"),
      cell: ({ row }) => formatDuration(row.original.durationMinutes),
    },
    {
      id: "attendees",
      header: t("pages.classes.attendees"),
      // "2 / 8", or just "2" without a limit.
      accessorFn: (c) =>
        c.capacity === null
          ? String(c.attendeeCount)
          : `${c.attendeeCount} / ${c.capacity}`,
    },
    {
      id: "status",
      header: t("common.status"),
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
  const { t } = useTranslation()
  const router = useRouter()
  const canManage = useCan("coaches:manage")
  const { classes, coaches, courts, activities } = Route.useLoaderData()
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
    () => buildColumns(t, canManage, options, showActivity),
    [t, canManage, options, showActivity]
  )
  // Series fill the list with classes, so finished ones can be hidden.
  const [hideCompleted, setHideCompleted] = useState(false)
  const visible = classes.filter(
    (c) =>
      (activityFilter === "all" || c.activityId === activityFilter) &&
      !(
        hideCompleted &&
        classStatus(c.date, c.startTime, c.durationMinutes) === "Completed"
      )
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("pages.classes.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pages.classes.description")}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={visible}
        searchPlaceholder={t("pages.classes.searchPlaceholder")}
        exportFileName="classes"
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 pr-2">
              <Switch
                id="hide-completed"
                checked={hideCompleted}
                onCheckedChange={setHideCompleted}
              />
              <Label htmlFor="hide-completed" className="font-normal">
                {t("pages.classes.hideCompleted")}
              </Label>
            </div>
            {showActivity && (
              <Select value={activityFilter} onValueChange={setActivityFilter}>
                <SelectTrigger
                  size="sm"
                  className="w-44"
                  aria-label={t("fields.activity")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("pages.classes.allActivities")}
                  </SelectItem>
                  {sessionActivities.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {activityDisplayName(a, t)}
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
                    {t("pages.classes.newButton")}
                  </Button>
                }
              />
            )}
          </div>
        }
      />
    </div>
  )
}
