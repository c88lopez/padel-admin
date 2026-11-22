import { useMemo, useState } from "react"
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import type { ColumnDef } from "@tanstack/react-table"
import { IconPlus } from "@tabler/icons-react"
import { differenceInYears, parseISO } from "date-fns"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/data-table"
import { NewCoachDrawer } from "@/components/new-coach-drawer"
import { RowActions } from "@/components/row-actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { deleteCoach, listCoaches } from "@/lib/coaches.functions"
import type { CoachRecord } from "@/lib/coaches.functions"
import { listActivities } from "@/lib/activities.functions"
import type { ActivityRecord } from "@/lib/activities.functions"
import {
  activityDisplayName,
  activityProvides,
} from "@/lib/activities/templates"
import { useCan } from "@/hooks/use-permissions"

// `?activity=<id>` preselects the activity filter (the sidebar's activity
// groups link here with it).
const activitySearchSchema = z.object({ activity: z.string().optional() })

export const Route = createFileRoute("/_authenticated/coaches/")({
  validateSearch: activitySearchSchema,
  loader: async () => ({
    coaches: await listCoaches(),
    activities: await listActivities(),
  }),
  component: CoachesPage,
})

function CoachActions({
  coach,
  activities,
}: {
  coach: CoachRecord
  activities: ActivityRecord[]
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const canManage = useCan("coaches:manage")
  const [editOpen, setEditOpen] = useState(false)

  async function handleDelete() {
    try {
      await deleteCoach({ data: { id: coach.id } })
      toast.success(t("pages.coaches.deleted"), { description: coach.name })
      router.invalidate()
    } catch {
      toast.error(t("pages.coaches.deleteError"), {
        description: t("common.tryAgain"),
      })
    }
  }

  if (!canManage) return null

  return (
    <>
      <NewCoachDrawer
        coach={{
          id: coach.id,
          name: coach.name,
          phone: coach.phone,
          birthday: coach.birthday ? parseISO(coach.birthday) : undefined,
          activityIds: coach.activityIds,
        }}
        activities={activities}
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
  activities: ActivityRecord[],
  showActivities: boolean
): ColumnDef<CoachRecord>[] {
  // Only active activities are listed; disabled ones stay linked but hidden.
  const activeName = new Map(
    activities
      .filter((a) => activityProvides(a, "sessions"))
      .map((a) => [a.id, activityDisplayName(a, t)])
  )
  const columns: ColumnDef<CoachRecord>[] = [
    {
      accessorKey: "name",
      header: t("fields.fullName"),
    },
    ...(showActivities
      ? [
          {
            id: "activities",
            header: t("forms.coach.activitiesLabel"),
            enableSorting: false,
            accessorFn: (c: CoachRecord) =>
              c.activityIds
                .flatMap((id) => activeName.get(id) ?? [])
                .join(", "),
          },
        ]
      : []),
    {
      accessorKey: "phone",
      header: t("fields.phone"),
      enableSorting: false,
    },
    {
      accessorKey: "birthday",
      header: t("pages.coaches.birthday"),
      cell: ({ row }) => {
        const birthday = row.getValue<string | null>("birthday")
        return birthday
          ? parseISO(birthday).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "—"
      },
    },
    {
      id: "age",
      header: t("fields.age"),
      cell: ({ row }) =>
        row.original.birthday
          ? t("pages.coaches.ageYears", {
              count: differenceInYears(
                new Date(),
                parseISO(row.original.birthday)
              ),
            })
          : "—",
    },
  ]

  if (canManage) {
    columns.push({
      id: "actions",
      enableSorting: false,
      meta: { className: "text-right" },
      cell: ({ row }) => (
        <CoachActions coach={row.original} activities={activities} />
      ),
    })
  }

  return columns
}

function CoachesPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const canManage = useCan("coaches:manage")
  const { coaches, activities } = Route.useLoaderData()
  // With several activities that run classes, show and filter by activity.
  const teachable = activities.filter((a) => activityProvides(a, "sessions"))
  const showActivities = teachable.length > 1
  const navigate = useNavigate({ from: Route.fullPath })
  const { activity } = Route.useSearch()
  const activityFilter =
    showActivities && activity && teachable.some((a) => a.id === activity)
      ? activity
      : "all"
  function setActivityFilter(value: string) {
    void navigate({
      search: { activity: value === "all" ? undefined : value },
      replace: true,
    })
  }
  const columns = useMemo(
    () => buildColumns(t, canManage, activities, showActivities),
    [t, canManage, activities, showActivities]
  )
  const visible =
    activityFilter === "all"
      ? coaches
      : coaches.filter((c) => c.activityIds.includes(activityFilter))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("pages.coaches.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pages.coaches.description")}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={visible}
        searchPlaceholder={t("pages.coaches.searchPlaceholder")}
        exportFileName="coaches"
        action={
          <div className="flex items-center gap-2">
            {showActivities && (
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
                  {teachable.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {activityDisplayName(a, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {canManage && (
              <NewCoachDrawer
                activities={activities}
                onSaved={() => router.invalidate()}
                trigger={
                  <Button size="sm">
                    <IconPlus className="size-4" />
                    {t("pages.coaches.newButton")}
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
