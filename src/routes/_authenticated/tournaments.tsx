import { useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { IconPlus } from "@tabler/icons-react"
import { parseISO } from "date-fns"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/data-table"
import { NewTournamentDrawer } from "@/components/new-tournament-drawer"
import type { TournamentData } from "@/components/new-tournament-drawer"
import { RowActions } from "@/components/row-actions"
import { deleteTournament, listTournaments } from "@/lib/tournaments.functions"
import { useCan } from "@/hooks/use-permissions"
import { usePrimaryLevelScale } from "@/hooks/use-activities"
import { NO_LEVELS } from "@/lib/activities/levels"
import type { Tournament } from "@/db/schema"

export const Route = createFileRoute("/_authenticated/tournaments")({
  loader: async () => ({ tournaments: await listTournaments() }),
  component: TournamentsPage,
})

const FORMAT_LABEL_KEYS: Record<string, string | undefined> = {
  round_robin: "Todos contra todos",
  elimination: "Eliminación simple",
  double_elimination: "Eliminación doble",
}

function toFormat(value: string): TournamentData["format"] {
  return value === "elimination" || value === "double_elimination"
    ? value
    : "round_robin"
}

function TournamentActions({ tournament }: { tournament: Tournament }) {
  const router = useRouter()
  const canManage = useCan("tournaments:manage")
  const levelScale = usePrimaryLevelScale() ?? NO_LEVELS
  const [editOpen, setEditOpen] = useState(false)

  async function handleDelete() {
    try {
      await deleteTournament({ data: { id: tournament.id } })
      toast.success("Torneo eliminado", {
        description: tournament.name,
      })
      router.invalidate()
    } catch {
      toast.error("No se pudo eliminar el torneo", {
        description: "Inténtalo de nuevo.",
      })
    }
  }

  if (!canManage) return null

  return (
    <>
      <NewTournamentDrawer
        levelScale={levelScale}
        tournament={{
          id: tournament.id,
          name: tournament.name,
          date: parseISO(tournament.date),
          category: tournament.category,
          format: toFormat(tournament.format),
          maxTeams: tournament.maxTeams,
        }}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => router.invalidate()}
      />
      <RowActions onEdit={() => setEditOpen(true)} onDelete={handleDelete} />
    </>
  )
}

function buildColumns(canManage: boolean): ColumnDef<Tournament>[] {
  const columns: ColumnDef<Tournament>[] = [
    {
      accessorKey: "name",
      header: "Nombre del torneo",
    },
    {
      accessorKey: "date",
      header: "Fecha",
      cell: ({ row }) =>
        parseISO(row.getValue<string>("date")).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
    },
    {
      accessorKey: "category",
      header: "Categoría",
    },
    {
      accessorKey: "format",
      header: "Formato",
      cell: ({ row }) => {
        const key = FORMAT_LABEL_KEYS[row.getValue<string>("format")]
        return key ? key : row.getValue<string>("format")
      },
    },
    {
      accessorKey: "maxTeams",
      header: "Máx. de equipos",
      meta: { className: "text-right" },
    },
  ]

  if (canManage) {
    columns.push({
      id: "actions",
      enableSorting: false,
      meta: { className: "text-right" },
      cell: ({ row }) => <TournamentActions tournament={row.original} />,
    })
  }

  return columns
}

function TournamentsPage() {
  const router = useRouter()
  const canManage = useCan("tournaments:manage")
  const levelScale = usePrimaryLevelScale() ?? NO_LEVELS
  const { tournaments } = Route.useLoaderData()
  const columns = useMemo(() => buildColumns(canManage), [canManage])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Torneos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administra los torneos del club.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={tournaments}
        searchPlaceholder="Buscar torneos..."
        exportFileName="tournaments"
        action={
          canManage ? (
            <NewTournamentDrawer
              levelScale={levelScale}
              onSaved={() => router.invalidate()}
              trigger={
                <Button size="sm">
                  <IconPlus className="size-4" />
                  {"Nuevo torneo"}
                </Button>
              }
            />
          ) : undefined
        }
      />
    </div>
  )
}
