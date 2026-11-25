import { useEffect, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { ensurePermission } from "@/lib/route-guards"
import { Button } from "@/components/ui/button"
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
  SettingsSection,
  SettingsSectionList,
} from "@/components/settings-section"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  countSpaceUsage,
  createSpace,
  deleteSpace,
  listSpaces,
  updateSpace,
} from "@/lib/spaces.functions"
import type { SpaceRecord } from "@/lib/spaces.functions"
import { listActivities } from "@/lib/activities.functions"
import type { ActivityRecord } from "@/lib/activities.functions"
import { activityDisplayName, getTemplate } from "@/lib/activities/templates"
import { getSpaceType, spaceDisplayName } from "@/lib/activities/spaces"
import { errorMessage } from "@/lib/errors"

export const Route = createFileRoute("/_authenticated/settings/spaces")({
  beforeLoad: ({ context }) =>
    ensurePermission(context.user.role, "settings:manage"),
  loader: async () => ({
    spaces: await listSpaces(),
    activities: await listActivities(),
  }),
  component: SpaceSettingsPage,
})

function SpaceSettingsPage() {
  const router = useRouter()
  const { spaces: loadedSpaces, activities } = Route.useLoaderData()
  // Local mirror of the DB spaces so name edits stay snappy (saved on blur).
  const [spaces, setSpaces] = useState<SpaceRecord[]>(loadedSpaces)
  const [spaceToDelete, setSpaceToDelete] = useState<SpaceRecord | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => setSpaces(loadedSpaces), [loadedSpaces])

  const withSpaces = activities.filter(
    (a) => a.active && getTemplate(a.templateKey)?.spaces
  )

  function updateLocal(id: string, partial: Partial<SpaceRecord>) {
    setSpaces((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...partial } : s))
    )
  }

  // Persists a single space to the DB. Reverts (via refetch) on failure.
  async function save(
    id: string,
    partial: Partial<Pick<SpaceRecord, "name" | "type" | "indoor" | "active">>
  ) {
    try {
      await updateSpace({ data: { id, ...partial } })
    } catch (err) {
      toast.error(errorMessage(err, "Algo salió mal"))
      router.invalidate()
    }
  }

  async function add(activity: ActivityRecord) {
    try {
      await createSpace({ data: { activityId: activity.id } })
      router.invalidate()
    } catch (err) {
      toast.error(errorMessage(err, "Algo salió mal"))
    }
  }

  // Confirm in a modal, then block deletion if the space is still in use by a
  // reservation or class; otherwise delete it.
  async function confirmRemove() {
    if (!spaceToDelete) return
    const target = spaceToDelete
    const label = spaceDisplayName(target)
    setChecking(true)
    try {
      const usage = await countSpaceUsage({ data: { id: target.id } })
      const total = usage.reservations + usage.classes
      if (total > 0) {
        toast.error(`No se puede eliminar ${label}`, {
          description:
            total === 1
              ? `${label} todavía tiene ${total} reserva o clase. Elimínala o reasígnala primero.`
              : `${label} todavía tiene ${total} reservas o clases. Elimínalas o reasígnalas primero.`,
        })
        return
      }
      await deleteSpace({ data: { id: target.id } })
      toast.success(`Se eliminó ${label}`)
      router.invalidate()
    } catch {
      toast.error("Algo salió mal", {
        description: "Inténtalo de nuevo.",
      })
    } finally {
      // Flip off loading so the bar snaps to 100%, then let it stay visible for
      // a beat before the dialog closes.
      setChecking(false)
      setTimeout(() => setSpaceToDelete(null), 400)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">Espacios</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dónde se realiza cada actividad: pistas, salas y más. Los espacios
          inactivos no se pueden reservar.
        </p>
      </div>

      {withSpaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ninguna de las actividades activas del club usa espacios.
        </p>
      ) : (
        <SettingsSectionList>
          {withSpaces.map((activity) => {
            const template = getTemplate(activity.templateKey)
            const types = template?.spaces?.types ?? []
            const defaultType = getSpaceType(types[0] ?? "")
            const activitySpaces = spaces.filter(
              (s) => s.activityId === activity.id
            )
            return (
              <SettingsSection
                key={activity.id}
                title={activityDisplayName(activity)}
                description={
                  activitySpaces.length === 1
                    ? "1 espacio"
                    : `${activitySpaces.length} espacios`
                }
              >
                <div className="flex flex-col gap-3">
                  {activitySpaces.map((space) => (
                    <SpaceRow
                      key={space.id}
                      space={space}
                      types={types}
                      onLocal={(partial) => updateLocal(space.id, partial)}
                      onSave={(partial) => save(space.id, partial)}
                      onRemove={() => setSpaceToDelete(space)}
                    />
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => add(activity)}
                  >
                    <IconPlus className="size-4" />
                    {`Agregar ${
                      defaultType ? defaultType.name.toLocaleLowerCase() : ""
                    }`}
                  </Button>
                </div>
              </SettingsSection>
            )
          })}
        </SettingsSectionList>
      )}

      <AlertDialog
        open={!!spaceToDelete}
        onOpenChange={(open) => {
          if (!open && !checking) setSpaceToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`¿Eliminar ${spaceToDelete ? spaceDisplayName(spaceToDelete) : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esto lo quita de tu configuración. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={checking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
              loading={checking}
              onClick={(e) => {
                e.preventDefault()
                void confirmRemove()
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SpaceRow({
  space,
  types,
  onLocal,
  onSave,
  onRemove,
}: {
  space: SpaceRecord
  types: readonly string[]
  onLocal: (partial: Partial<SpaceRecord>) => void
  onSave: (
    partial: Partial<Pick<SpaceRecord, "name" | "type" | "indoor" | "active">>
  ) => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b pb-3 last:border-b-0 last:pb-0">
      <Input
        value={space.name}
        aria-label="Nombre"
        onChange={(e) => onLocal({ name: e.target.value })}
        onBlur={(e) => {
          const name = e.target.value.trim()
          if (name) onSave({ name })
        }}
        className="h-8 w-40"
      />
      {/* Only activities that allow several kinds of space pick one. */}
      {types.length > 1 && (
        <Select
          value={space.type}
          onValueChange={(type) => {
            onLocal({ type })
            onSave({ type })
          }}
        >
          <SelectTrigger className="h-8 w-32" aria-label="Tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((key) => {
              const type = getSpaceType(key)
              return (
                <SelectItem key={key} value={key}>
                  {type ? type.name : key}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      )}
      <Select
        value={space.indoor ? "indoor" : "outdoor"}
        onValueChange={(v) => {
          const indoor = v === "indoor"
          onLocal({ indoor })
          onSave({ indoor })
        }}
      >
        <SelectTrigger className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="indoor">Cubierto</SelectItem>
          <SelectItem value="outdoor">Descubierto</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Switch
          checked={space.active}
          onCheckedChange={(checked) => {
            onLocal({ active: checked })
            onSave({ active: checked })
          }}
        />
        <span className="w-14 text-xs text-muted-foreground">
          {space.active ? "Activo" : "Inactivo"}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto size-8 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label={`Eliminar ${spaceDisplayName(space)}`}
      >
        <IconTrash className="size-4" />
      </Button>
    </div>
  )
}
