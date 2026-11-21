import { useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import type { ColumnDef } from "@tanstack/react-table"
import { IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTable } from "@/components/data-table"
import { NewClassDrawer } from "@/components/new-class-drawer"
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
import { useCan } from "@/hooks/use-permissions"

export const Route = createFileRoute("/_authenticated/coaches/classes")({
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
      <RowActions onEdit={() => setEditOpen(true)} onDelete={handleDelete} />
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
      id: "capacity",
      header: t("fields.capacity"),
      accessorFn: (c) => c.capacity ?? t("pages.classes.noLimit"),
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
  const [activityFilter, setActivityFilter] = useState("all")
  const columns = useMemo(
    () => buildColumns(t, canManage, options, showActivity),
    [t, canManage, options, showActivity]
  )
  const visible =
    activityFilter === "all"
      ? classes
      : classes.filter((c) => c.activityId === activityFilter)

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
