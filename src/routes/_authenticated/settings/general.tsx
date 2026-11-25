import { useEffect, useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { ensurePermission } from "@/lib/route-guards"
import { Button } from "@/components/ui/button"
import {
  SettingsSection,
  SettingsSectionList,
} from "@/components/settings-section"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  DEFAULT_APP_SETTINGS,
  setAppSettings,
  TIMEZONES,
  useAppSettings,
  useAppSettingsHydrated,
} from "@/lib/app-settings"
import type { GeneralSettings, TimeFormat, WeekStart } from "@/lib/app-settings"
import { getClubContext, renameActiveClub } from "@/lib/clubs.functions"
import { errorMessage } from "@/lib/errors"

export const Route = createFileRoute("/_authenticated/settings/general")({
  beforeLoad: ({ context }) =>
    ensurePermission(context.user.role, "settings:manage"),
  loader: async () => {
    const ctx = await getClubContext()
    return { clubName: ctx.activeClubName ?? "" }
  },
  component: GeneralSettingsPage,
})

function buildTimeFormats(): { value: TimeFormat; label: string }[] {
  return [
    { value: "24h", label: "24 horas" },
    { value: "12h", label: "12 horas" },
  ]
}

function buildWeekStarts(): { value: WeekStart; label: string }[] {
  return [
    { value: "monday", label: "Lunes" },
    { value: "sunday", label: "Domingo" },
  ]
}

function GeneralSettingsPage() {
  const router = useRouter()
  const { clubName: savedClubName } = Route.useLoaderData()
  const settings = useAppSettings()
  // Per-club settings load from localStorage after mount; until then show a
  // skeleton so the inputs don't flash from empty defaults to real values.
  const ready = useAppSettingsHydrated()
  const { general } = settings
  const timeFormats = useMemo(() => buildTimeFormats(), [])
  const weekStarts = useMemo(() => buildWeekStarts(), [])

  // Club name is stored in the database (shared across users/devices and shown
  // in the sidebar), not in the per-club client settings blob.
  const [clubName, setClubName] = useState(savedClubName)
  useEffect(() => {
    setClubName(savedClubName)
  }, [savedClubName])

  async function saveClubName() {
    const trimmed = clubName.trim()
    if (!trimmed || trimmed === savedClubName) return
    try {
      await renameActiveClub({ data: { name: trimmed } })
      await router.invalidate()
      toast.success("Nombre del club actualizado")
    } catch (error) {
      toast.error("No se pudo actualizar el nombre del club", {
        description: errorMessage(error, "Inténtalo de nuevo."),
      })
      setClubName(savedClubName)
    }
  }

  function update(partial: Partial<GeneralSettings>) {
    setAppSettings({ ...settings, general: { ...general, ...partial } })
  }

  function reset() {
    setAppSettings({ ...settings, general: DEFAULT_APP_SETTINGS.general })
    toast.success(
      "Configuración general restablecida a los valores predeterminados"
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">General</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El perfil de tu club y las preferencias regionales.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          Restablecer valores predeterminados
        </Button>
      </div>

      <SettingsSectionList>
        <SettingsSection
          title="Perfil del club"
          description="Se muestra en toda la app, incluida la barra lateral."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="clubName">Nombre del club</Label>
              {ready ? (
                <Input
                  id="clubName"
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  onBlur={saveClubName}
                  className="sm:max-w-sm"
                />
              ) : (
                <Skeleton className="h-8 w-full rounded-2xl sm:max-w-sm" />
              )}
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="address">Dirección</Label>
              {ready ? (
                <Input
                  id="address"
                  placeholder="Calle, ciudad, país"
                  value={general.address}
                  onChange={(e) => update({ address: e.target.value })}
                />
              ) : (
                <Skeleton className="h-8 w-full rounded-2xl" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">Teléfono</Label>
              {ready ? (
                <Input
                  id="phone"
                  value={general.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                  className="sm:max-w-sm"
                />
              ) : (
                <Skeleton className="h-8 w-full rounded-2xl sm:max-w-sm" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo electrónico</Label>
              {ready ? (
                <Input
                  id="email"
                  type="email"
                  value={general.email}
                  onChange={(e) => update({ email: e.target.value })}
                  className="sm:max-w-sm"
                />
              ) : (
                <Skeleton className="h-8 w-full rounded-2xl sm:max-w-sm" />
              )}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Regional"
          description="Controla el formato de fechas y horas en toda la app."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Zona horaria</Label>
              {ready ? (
                <Select
                  value={general.timezone}
                  onValueChange={(v) => update({ timezone: v })}
                >
                  <SelectTrigger className="w-full sm:max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Skeleton className="h-8 w-full rounded-2xl sm:max-w-sm" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label>Formato de hora</Label>
              {ready ? (
                <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
                  {timeFormats.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update({ timeFormat: opt.value })}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted",
                        general.timeFormat === opt.value
                          ? "border-primary ring-2 ring-ring ring-offset-2 ring-offset-background"
                          : "border-border"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
                  {timeFormats.map((opt) => (
                    <Skeleton
                      key={opt.value}
                      className="rounded-md border border-transparent px-3 py-2 text-sm"
                    >
                      <span className="invisible">{opt.label}</span>
                    </Skeleton>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label>La semana empieza en</Label>
              {ready ? (
                <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
                  {weekStarts.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update({ weekStart: opt.value })}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted",
                        general.weekStart === opt.value
                          ? "border-primary ring-2 ring-ring ring-offset-2 ring-offset-background"
                          : "border-border"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
                  {weekStarts.map((opt) => (
                    <Skeleton
                      key={opt.value}
                      className="rounded-md border border-transparent px-3 py-2 text-sm"
                    >
                      <span className="invisible">{opt.label}</span>
                    </Skeleton>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SettingsSection>
      </SettingsSectionList>
    </div>
  )
}
