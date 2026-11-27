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
import {
  SettingsSection,
  SettingsSectionList,
} from "@/components/settings-section"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NewUserDrawer, USER_ROLES } from "@/components/new-user-drawer"
import type { UserRole } from "@/components/new-user-drawer"
import { roleLabel } from "@/lib/users"
import { cn } from "@/lib/utils"
import {
  clampNumber,
  setAppSettings,
  useAppSettings,
  useAppSettingsHydrated,
} from "@/lib/app-settings"
import type { SecuritySettings } from "@/lib/app-settings"
import { listClubOptions } from "@/lib/clubs.functions"
import { errorMessage } from "@/lib/errors"
import {
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  setUserArchived,
  updateUser,
} from "@/lib/users.functions"

type ClubOption = { id: string; name: string }

export const Route = createFileRoute("/_authenticated/settings/users")({
  beforeLoad: ({ context }) =>
    ensurePermission(context.user.role, "users:manage"),
  loader: async () => {
    const [users, clubs] = await Promise.all([listUsers(), listClubOptions()])
    return { users, clubs }
  },
  component: UsersSettingsPage,
})

interface User {
  id: string
  name: string
  email: string
  role: UserRole
  status: string
  // Default club first.
  clubs: { id: string; name: string }[]
}

function UserActions({ user, clubs }: { user: User; clubs: ClubOption[] }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isArchived = user.status === "archived"

  async function handleResetPassword() {
    try {
      const { tempPassword } = await resetUserPassword({
        data: { id: user.id },
      })
      toast.success("Contraseña temporal establecida", {
        description: `${user.email} — ${tempPassword}`,
        duration: 10000,
      })
    } catch (error) {
      toast.error("No se pudo restablecer la contraseña", {
        description: errorMessage(error, "Inténtalo de nuevo."),
      })
    }
  }

  async function handleToggleArchive() {
    try {
      await setUserArchived({
        data: { id: user.id, archived: !isArchived },
      })
      toast.success(isArchived ? "Usuario restaurado" : "Usuario archivado", {
        description: isArchived
          ? `${user.name} ahora está activo.`
          : `${user.name} ahora está archivado.`,
      })
      router.invalidate()
    } catch (error) {
      toast.error("No se pudo actualizar el usuario", {
        description: errorMessage(error, "Inténtalo de nuevo."),
      })
    }
  }

  async function handleDelete() {
    try {
      await deleteUser({ data: { id: user.id } })
      toast.success("Usuario eliminado", {
        description: `${user.name} se ha eliminado.`,
      })
      router.invalidate()
    } catch (error) {
      toast.error("No se pudo eliminar el usuario", {
        description: errorMessage(error, "Inténtalo de nuevo."),
      })
    } finally {
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <NewUserDrawer
        user={{
          name: user.name,
          email: user.email,
          role: user.role,
          clubIds: user.clubs.map((c) => c.id),
        }}
        canAssignClubs={clubs.length > 0}
        clubs={clubs}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={async (data) => {
          await updateUser({
            data: {
              id: user.id,
              name: data.name,
              email: data.email,
              role: data.role,
              clubIds: data.clubIds,
            },
          })
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
          <DropdownMenuItem onClick={handleResetPassword}>
            Restablecer contraseña
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleToggleArchive}>
            {isArchived ? "Restaurar" : "Archivar"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`¿Eliminar ${user.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Esto elimina permanentemente al usuario y su acceso. Esta acción
              no se puede deshacer.
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

function SecuritySection() {
  const settings = useAppSettings()
  // Per-club settings load from localStorage after mount; until then show a
  // skeleton so the controls don't flash from default to real values.
  const ready = useAppSettingsHydrated()
  const { security } = settings

  function update(partial: Partial<SecuritySettings>) {
    setAppSettings({ ...settings, security: { ...security, ...partial } })
  }

  return (
    <SettingsSectionList>
      <SettingsSection
        title="Seguridad"
        description="Valores predeterminados para nuevas cuentas, política de contraseñas y sesiones."
      >
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Rol predeterminado para nuevos usuarios</Label>
              {ready ? (
                <Select
                  value={security.defaultRole}
                  onValueChange={(v) => update({ defaultRole: v as UserRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_ROLES.map((role) => (
                      <SelectItem key={roleLabel(role)} value={roleLabel(role)}>
                        {roleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Skeleton className="h-8 w-full rounded-2xl" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sessionTimeout">
                Tiempo de espera de sesión (minutos)
              </Label>
              {ready ? (
                <Input
                  id="sessionTimeout"
                  type="number"
                  min={5}
                  value={security.sessionTimeoutMinutes}
                  onChange={(e) =>
                    update({
                      sessionTimeoutMinutes: clampNumber(e.target.value, 5),
                    })
                  }
                />
              ) : (
                <Skeleton className="h-8 w-full rounded-2xl" />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Política de contraseñas</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="minLength">Longitud mínima</Label>
                {ready ? (
                  <Input
                    id="minLength"
                    type="number"
                    min={6}
                    value={security.passwordMinLength}
                    onChange={(e) =>
                      update({
                        passwordMinLength: clampNumber(e.target.value, 6),
                      })
                    }
                  />
                ) : (
                  <Skeleton className="h-8 w-full rounded-2xl" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="expiryDays">Caducidad (días, 0 = nunca)</Label>
                {ready ? (
                  <Input
                    id="expiryDays"
                    type="number"
                    min={0}
                    value={security.passwordExpiryDays}
                    onChange={(e) =>
                      update({
                        passwordExpiryDays: clampNumber(e.target.value, 0),
                      })
                    }
                  />
                ) : (
                  <Skeleton className="h-8 w-full rounded-2xl" />
                )}
              </div>
            </div>
            <div className="flex flex-col divide-y rounded-md border">
              <div className="flex items-center gap-3 px-3 py-2.5">
                {ready ? (
                  <Switch
                    checked={security.passwordRequireUppercase}
                    onCheckedChange={(c) =>
                      update({ passwordRequireUppercase: c })
                    }
                  />
                ) : (
                  <Skeleton className="h-5 w-9 rounded-full" />
                )}
                <span className="text-sm">Requerir una letra mayúscula</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                {ready ? (
                  <Switch
                    checked={security.passwordRequireNumber}
                    onCheckedChange={(c) =>
                      update({ passwordRequireNumber: c })
                    }
                  />
                ) : (
                  <Skeleton className="h-5 w-9 rounded-full" />
                )}
                <span className="text-sm">Requerir un número</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                {ready ? (
                  <Switch
                    checked={security.passwordRequireSymbol}
                    onCheckedChange={(c) =>
                      update({ passwordRequireSymbol: c })
                    }
                  />
                ) : (
                  <Skeleton className="h-5 w-9 rounded-full" />
                )}
                <span className="text-sm">Requerir un símbolo</span>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>
    </SettingsSectionList>
  )
}

function buildColumns(clubs: ClubOption[]): ColumnDef<User>[] {
  return [
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }) => (
        <span
          className={cn(
            "font-medium",
            row.original.status === "archived" && "text-muted-foreground"
          )}
        >
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "email",
      header: "Correo electrónico",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.email}</span>
      ),
    },
    {
      accessorKey: "role",
      header: "Rol",
      cell: ({ row }) => (
        <Badge variant="secondary">
          {roleLabel(row.getValue<UserRole>("role"))}
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) =>
        row.getValue<string>("status") === "active" ? (
          <Badge variant="default">Activo</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Archivado
          </Badge>
        ),
    },
    {
      id: "actions",
      enableSorting: false,
      meta: { className: "text-right" },
      cell: ({ row }) => <UserActions user={row.original} clubs={clubs} />,
    },
  ]
}

function UsersSettingsPage() {
  const router = useRouter()
  const { users: rawUsers, clubs } = Route.useLoaderData()
  const users: User[] = rawUsers.map((u) => ({
    ...u,
    role: u.role as UserRole,
  }))

  const columns = useMemo(() => buildColumns(clubs), [clubs])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Usuarios</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invita compañeros, asigna roles y administra el acceso.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={users}
        searchPlaceholder="Buscar usuarios..."
        exportFileName="users"
        action={
          <NewUserDrawer
            canAssignClubs={clubs.length > 0}
            clubs={clubs}
            onSave={async (data) => {
              await createUser({
                data: {
                  name: data.name,
                  email: data.email,
                  role: data.role,
                  password: data.password ?? "",
                  clubIds: data.clubIds,
                },
              })
              router.invalidate()
            }}
            trigger={
              <Button size="sm">
                <IconPlus className="size-4" />
                {"Nuevo usuario"}
              </Button>
            }
          />
        }
      />

      <SecuritySection />
    </div>
  )
}
