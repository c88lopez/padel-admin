import { useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import {
  IconPlus,
  IconLayoutGrid,
  IconUsers,
  IconCalendar,
  IconMedal,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { Bar, BarChart, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ChartConfig } from "@/components/ui/chart"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { DataTable } from "@/components/data-table"
import { NewPlayerDrawer } from "@/components/new-player-drawer"
import { RowActions } from "@/components/row-actions"
import { deletePlayer, listPlayers } from "@/lib/players.functions"
import { getPlayerStats } from "@/lib/stats.functions"
import { useCan } from "@/hooks/use-permissions"
import type { PlayerRecord } from "@/lib/players.functions"
import { listActivities } from "@/lib/activities.functions"
import { allLevels, levelRank, NO_LEVELS } from "@/lib/activities/levels"
import type { LevelScale } from "@/lib/activities/levels"
import { activityProvides } from "@/lib/activities/templates"
import { useCustomerView } from "@/hooks/use-customer-view"
import type { CustomerView } from "@/hooks/use-customer-view"
import { AppError } from "@/lib/errors"

// `?activity=<id>` picks whose customers to list (padel players, pilates
// students); without it, the club's first active activity.
const searchSchema = z.object({ activity: z.string().optional() })

export const Route = createFileRoute("/_authenticated/players")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ activity: search.activity }),
  loader: async ({ deps }) => {
    const active = (await listActivities()).filter((a) => a.active)
    const activity = active.find((a) => a.id === deps.activity) ?? active.at(0)
    if (!activity)
      throw new AppError("errors.activity.notFound", "Actividad no encontrada.")
    return {
      activity,
      players: await listPlayers({ data: { activityId: activity.id } }),
      stats: await getPlayerStats(),
    }
  },
  component: PlayersPage,
})

type Player = PlayerRecord

// Matching levels across groups (C4 and D4) share a chart color.
function levelFill(scale: LevelScale, level: string): string {
  return `var(--chart-${(Math.max(levelRank(scale, level), 0) % 5) + 1})`
}

function buildCategoryChartConfig(): ChartConfig {
  return {
    count: { label: "Jugadores" },
  }
}

// More advanced levels get a bolder badge.
function levelVariant(
  scale: LevelScale,
  level: string
): "default" | "secondary" | "outline" | undefined {
  const rank = levelRank(scale, level)
  if (rank < 0) return undefined
  if (rank <= 1) return "default"
  return rank <= 3 ? "secondary" : "outline"
}

function PlayerActions({
  player,
  view,
}: {
  player: Player
  view: CustomerView
}) {
  const router = useRouter()
  const canManage = useCan("players:manage")
  const [editOpen, setEditOpen] = useState(false)

  async function handleDelete() {
    try {
      await deletePlayer({
        data: { id: player.id, activityId: view.activity.id },
      })
      toast.success(view.text("deleted"), {
        description: player.fullName,
      })
      router.invalidate()
    } catch {
      toast.error("No se pudo eliminar el cliente", {
        description: "Inténtalo de nuevo.",
      })
    }
  }

  if (!canManage) return null

  return (
    <>
      <NewPlayerDrawer
        view={view}
        player={{
          ...player,
          gender: player.gender as "Male" | "Female",
          category: player.category ?? "",
        }}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => router.invalidate()}
      />
      <RowActions onEdit={() => setEditOpen(true)} onDelete={handleDelete} />
    </>
  )
}

function buildColumns(view: CustomerView): ColumnDef<Player>[] {
  const { levelScale } = view
  const hasLevels = levelScale !== NO_LEVELS
  const columns: ColumnDef<Player>[] = [
    {
      accessorKey: "fullName",
      header: "Nombre completo",
    },
    {
      accessorKey: "gender",
      header: "Género",
      cell: ({ row }) => {
        const gender = row.getValue<string>("gender")
        const label =
          gender === "Male"
            ? "Masculino"
            : gender === "Female"
              ? "Femenino"
              : gender
        return <span className="text-sm text-muted-foreground">{label}</span>
      },
    },
  ]
  if (hasLevels) {
    columns.push({
      accessorKey: "category",
      header: "Categoría",
      meta: { className: "w-[384px] text-center" },
      cell: ({ row }) => {
        const cat = row.getValue<string | null>("category")
        return cat ? (
          <div className="flex justify-center">
            <Badge variant={levelVariant(levelScale, cat)}>{cat}</Badge>
          </div>
        ) : null
      },
    })
  }
  columns.push(
    {
      accessorKey: "phone",
      header: "Teléfono",
      enableSorting: false,
    },
    {
      accessorKey: "age",
      header: "Edad",
    },
    {
      id: "actions",
      enableSorting: false,
      meta: { className: "text-right" },
      cell: ({ row }) => <PlayerActions player={row.original} view={view} />,
    }
  )
  return columns
}

function PlayersPage() {
  const router = useRouter()
  const canManage = useCan("players:manage")
  const { activity, players, stats } = Route.useLoaderData()
  const view = useCustomerView(activity)
  const { levelScale } = view
  const hasLevels = levelScale !== NO_LEVELS
  const hasBookings = activityProvides(activity, "bookings")
  const columns = useMemo(() => buildColumns(view), [view])
  const categoryChartConfig = useMemo(() => buildCategoryChartConfig(), [])

  const maleCount = players.filter((p) => p.gender === "Male").length
  const femaleCount = players.filter((p) => p.gender === "Female").length

  const categoryDistribution = allLevels(levelScale).map((category) => ({
    category,
    count: players.filter((p) => p.category === category).length,
    fill: levelFill(levelScale, category),
  }))

  const topCategory = categoryDistribution.reduce(
    (best, c) => (c.count > best.count ? c : best),
    { category: "—", count: 0 }
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{view.text("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administra los socios del club.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {view.text("statsTotal")}
            </CardTitle>
            <IconUsers className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{players.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {`${maleCount}H · ${femaleCount}M`}
            </p>
          </CardContent>
        </Card>

        {hasBookings && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Más reservas
              </CardTitle>
              <IconCalendar className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="truncate text-xl font-bold">
                {stats.topReservationPlayer?.name ?? "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.topReservationPlayer
                  ? stats.topReservationPlayer.count === 1
                    ? `${stats.topReservationPlayer.count} reserva`
                    : `${stats.topReservationPlayer.count} reservas`
                  : "Aún no hay reservas"}
              </p>
            </CardContent>
          </Card>
        )}

        {hasBookings && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Pista más activa
              </CardTitle>
              <IconLayoutGrid className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="truncate text-xl font-bold">
                {stats.busiestCourt ? `Pista ${stats.busiestCourt.court}` : "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.busiestCourt
                  ? stats.busiestCourt.count === 1
                    ? `${stats.busiestCourt.count} reserva`
                    : `${stats.busiestCourt.count} reservas`
                  : "Aún no hay reservas"}
              </p>
            </CardContent>
          </Card>
        )}

        {hasLevels && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Categoría principal
              </CardTitle>
              <IconMedal className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{topCategory.category}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {topCategory.count === 1
                  ? `${topCategory.count} jugador`
                  : `${topCategory.count} jugadores`}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Category distribution chart */}
      {hasLevels && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Distribución por categoría
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={categoryChartConfig}
              className="h-40 w-full"
            >
              <BarChart data={categoryDistribution} barSize={28}>
                <XAxis
                  dataKey="category"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <YAxis hide />
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel />}
                  cursor={false}
                />
                <Bar dataKey="count" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={players}
        searchPlaceholder={view.text("searchPlaceholder")}
        action={
          canManage ? (
            <NewPlayerDrawer
              view={view}
              onSaved={() => router.invalidate()}
              trigger={
                <Button size="sm">
                  <IconPlus className="size-4" />
                  {view.text("newButton")}
                </Button>
              }
            />
          ) : undefined
        }
      />
    </div>
  )
}
