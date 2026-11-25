import { useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { ensurePermission } from "@/lib/route-guards"
import type { ColumnDef } from "@tanstack/react-table"
import { IconDotsVertical, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/data-table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NewClubDrawer } from "@/components/new-club-drawer"
import {
  createClub,
  deleteClub,
  listClubs,
  updateClub,
} from "@/lib/clubs.functions"
import type { ClubRecord } from "@/lib/clubs.functions"
import { errorMessage } from "@/lib/errors"

export const Route = createFileRoute("/_authenticated/settings/clubs")({
  beforeLoad: ({ context }) =>
    ensurePermission(context.user.role, "clubs:manage"),
  loader: async () => ({ clubs: await listClubs() }),
  component: ClubsSettingsPage,
})

function ClubActions({ club }: { club: ClubRecord }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isDefault = club.slug === "default"

  async function handleDelete() {
    try {
      await deleteClub({ data: { id: club.id } })
      toast.success("Club eliminado", {
        description: `${club.name} se ha eliminado.`,
      })
      router.invalidate()
    } catch (error) {
      toast.error("No se pudo eliminar el club", {
        description: errorMessage(error, "Inténtalo de nuevo."),
      })
    } finally {
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <NewClubDrawer
        club={{
          name: club.name,
          status: club.status === "inactive" ? "inactive" : "active",
        }}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={async (data) => {
          await updateClub({ data: { id: club.id, ...data } })
          router.invalidate()
        }}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <IconDotsVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={isDefault}
            onClick={() => setConfirmOpen(true)}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`¿Eliminar ${club.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {"Esto elimina permanentemente el club y"} <strong>todos</strong>{" "}
              {`sus datos: jugadores, reservas, inventario, ventas, entrenadores, clases y ${club.memberCount} cuenta(s) de miembro. Esto no se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function buildColumns(): ColumnDef<ClubRecord>[] {
  return [
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "slug",
      header: "Slug",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.slug}</span>
      ),
    },
    {
      accessorKey: "memberCount",
      header: "Miembros",
      cell: ({ row }) => row.original.memberCount,
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) =>
        row.original.status === "active" ? (
          <Badge variant="default">Activo</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Inactivo
          </Badge>
        ),
    },
    {
      id: "actions",
      enableSorting: false,
      meta: { className: "text-right" },
      cell: ({ row }) => <ClubActions club={row.original} />,
    },
  ]
}

function ClubsSettingsPage() {
  const router = useRouter()
  const { clubs } = Route.useLoaderData()

  const columns = useMemo(() => buildColumns(), [])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Clubes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Crea clubes y revisa su membresía. Asigna usuarios a un club desde la
          pestaña Usuarios.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={clubs}
        searchPlaceholder="Buscar clubes..."
        exportFileName="clubs"
        action={
          <NewClubDrawer
            onSave={async (data) => {
              await createClub({ data })
              router.invalidate()
            }}
            trigger={
              <Button size="sm">
                <IconPlus className="size-4" />
                {"Nuevo club"}
              </Button>
            }
          />
        }
      />
    </div>
  )
}
