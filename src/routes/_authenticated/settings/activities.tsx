import { useEffect, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { ensurePermission } from "@/lib/route-guards"
import {
  SettingsSection,
  SettingsSectionList,
} from "@/components/settings-section"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { listActivities, renameActivity } from "@/lib/activities.functions"
import type { ActivityRecord } from "@/lib/activities.functions"
import { getTemplate } from "@/lib/activities/templates"
import type { ActivityTemplate } from "@/lib/activities/templates"
import { errorMessage } from "@/lib/errors"

export const Route = createFileRoute("/_authenticated/settings/activities")({
  beforeLoad: ({ context }) =>
    ensurePermission(context.user.role, "settings:manage"),
  loader: () => listActivities(),
  component: ActivitySettingsPage,
})

function ActivitySettingsPage() {
  const activities = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">Actividades</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige lo que ofrece tu club. Cada actividad añade sus propias
          secciones a la aplicación.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Las actividades las activan los responsables de la aplicación.
          Contacta con soporte para añadir una.
        </p>
      </div>

      <SettingsSectionList>
        {activities.map((activity) => {
          const template = getTemplate(activity.templateKey)
          return template ? (
            <ActivitySection
              key={activity.id}
              activity={activity}
              template={template}
            />
          ) : null
        })}
      </SettingsSectionList>
    </div>
  )
}

function ActivitySection({
  activity,
  template,
}: {
  activity: ActivityRecord
  template: ActivityTemplate
}) {
  const router = useRouter()
  const defaultName = template.name
  const displayName = activity.name ?? defaultName
  const [name, setName] = useState(activity.name ?? "")
  useEffect(() => {
    setName(activity.name ?? "")
  }, [activity.name])

  async function saveName() {
    const next = name.trim() || null
    if (next === activity.name) return
    try {
      await renameActivity({ data: { id: activity.id, name: next } })
      // Refreshes the layout too, so the navigation reflects the change.
      await router.invalidate()
      toast.success("Actividad renombrada")
    } catch (error) {
      toast.error("No se pudo actualizar la actividad", {
        description: errorMessage(error, "Inténtalo de nuevo."),
      })
      setName(activity.name ?? "")
    }
  }

  const nameId = `activity-${activity.id}-name`

  return (
    <SettingsSection title={displayName} description={template.description}>
      <div className="flex flex-col gap-4 sm:max-w-sm">
        <div className="flex items-center gap-3">
          <template.icon className="size-5 text-muted-foreground" />
          <Badge variant={activity.active ? "default" : "secondary"}>
            {activity.active ? "Activada" : "Desactivada"}
          </Badge>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={nameId}>Nombre visible</Label>
          <Input
            id={nameId}
            value={name}
            placeholder={defaultName}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
          />
          <p className="text-xs text-muted-foreground">
            Déjalo vacío para usar el nombre predeterminado.
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}
