import { useEffect, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
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
import { translateError } from "@/lib/errors"

export const Route = createFileRoute("/_authenticated/settings/activities")({
  beforeLoad: ({ context }) =>
    ensurePermission(context.user.role, "settings:manage"),
  loader: () => listActivities(),
  component: ActivitySettingsPage,
})

function ActivitySettingsPage() {
  const { t } = useTranslation()
  const activities = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">
          {t("settings.activities.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.activities.description")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.activities.managedNote")}
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
  const { t } = useTranslation()
  const router = useRouter()
  const defaultName = t(template.nameKey)
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
      toast.success(t("settings.activities.renamedToast"))
    } catch (error) {
      toast.error(t("settings.activities.updateError"), {
        description: translateError(error, t, t("common.tryAgain")),
      })
      setName(activity.name ?? "")
    }
  }

  const nameId = `activity-${activity.id}-name`

  return (
    <SettingsSection
      title={displayName}
      description={t(template.descriptionKey)}
    >
      <div className="flex flex-col gap-4 sm:max-w-sm">
        <div className="flex items-center gap-3">
          <template.icon className="size-5 text-muted-foreground" />
          <Badge variant={activity.active ? "default" : "secondary"}>
            {t(
              activity.active
                ? "settings.activities.statusEnabled"
                : "settings.activities.statusDisabled"
            )}
          </Badge>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={nameId}>{t("settings.activities.nameLabel")}</Label>
          <Input
            id={nameId}
            value={name}
            placeholder={defaultName}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings.activities.nameHint")}
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}
