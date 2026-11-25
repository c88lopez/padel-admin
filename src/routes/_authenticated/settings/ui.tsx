import { useEffect, useState } from "react"
import { createFileRoute, useLoaderData } from "@tanstack/react-router"
import {
  IconCheck,
  IconDeviceDesktop,
  IconMoon,
  IconSun,
} from "@tabler/icons-react"
import type { Icon } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  SettingsSection,
  SettingsSectionList,
} from "@/components/settings-section"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  ACCENT_COLORS,
  applyUiSettings,
  DEFAULT_UI_SETTINGS,
  FONT_SIZES,
  loadUiSettings,
  resolveAccent,
  saveClubAccent,
  saveUiSettings,
} from "@/lib/ui-settings"
import type { ThemeMode, UiSettings } from "@/lib/ui-settings"

export const Route = createFileRoute("/_authenticated/settings/ui")({
  component: UiSettingsPage,
})

const themeOptions: {
  value: ThemeMode
  label: string
  icon: Icon
}[] = [
  { value: "light", label: "Claro", icon: IconSun },
  { value: "dark", label: "Oscuro", icon: IconMoon },
  {
    value: "system",
    label: "Sistema",
    icon: IconDeviceDesktop,
  },
]

const fontSizeLabels: Record<string, string> = {
  sm: "Pequeño",
  md: "Predeterminado",
  lg: "Grande",
  xl: "Muy grande",
}

function UiSettingsPage() {
  const { clubContext } = useLoaderData({ from: "/_authenticated" })
  const clubId = clubContext.activeClubId
  const [settings, setSettings] = useState<UiSettings>(() => loadUiSettings())
  // The accent is scoped to the active club; theme/font size stay global.
  const [accent, setAccent] = useState<string>(() =>
    resolveAccent(clubId, loadUiSettings())
  )
  // Theme/accent/font size resolve from localStorage on the client only, so the
  // selected state would otherwise pop in after mount. Gate on mount and show a
  // skeleton until the real selections are known.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  // Theme / font size — global preferences.
  function update(partial: Partial<UiSettings>) {
    const next = { ...settings, ...partial }
    setSettings(next)
    saveUiSettings(next)
    applyUiSettings(next, accent)
  }

  // Accent color — saved against the active club only.
  function updateAccent(accentKey: string) {
    setAccent(accentKey)
    if (clubId) {
      saveClubAccent(clubId, accentKey)
    } else {
      const next = { ...settings, accent: accentKey }
      setSettings(next)
      saveUiSettings(next)
    }
    applyUiSettings(settings, accentKey)
  }

  function resetDefaults() {
    setSettings(DEFAULT_UI_SETTINGS)
    saveUiSettings(DEFAULT_UI_SETTINGS)
    setAccent(DEFAULT_UI_SETTINGS.accent)
    if (clubId) saveClubAccent(clubId, DEFAULT_UI_SETTINGS.accent)
    applyUiSettings(DEFAULT_UI_SETTINGS, DEFAULT_UI_SETTINGS.accent)
    toast.success("Apariencia restablecida a los valores predeterminados")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Interfaz</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Personaliza el tema, el color de acento y el tamaño del texto.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetDefaults}>
          Restablecer valores predeterminados
        </Button>
      </div>

      <SettingsSectionList>
        <SettingsSection
          title="Tema"
          description="Elige claro, oscuro o sigue tu sistema operativo."
        >
          {ready ? (
            <div className="grid grid-cols-3 gap-3 sm:max-w-md">
              {themeOptions.map((opt) => {
                const active = settings.theme === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update({ theme: opt.value })}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-muted",
                      active
                        ? "border-primary ring-2 ring-ring ring-offset-2 ring-offset-background"
                        : "border-border"
                    )}
                  >
                    <opt.icon className="size-5" />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:max-w-md">
              {themeOptions.map((opt) => (
                <Skeleton
                  key={opt.value}
                  className="flex flex-col items-center gap-2 rounded-lg border border-transparent p-4 text-sm"
                >
                  <span className="block size-5" />
                  <span className="invisible">{opt.label}</span>
                </Skeleton>
              ))}
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          title="Color de acento"
          description="Se guarda para el club actual: se usa en botones principales, resaltados y estados activos."
        >
          {ready ? (
            <div className="flex flex-wrap gap-3">
              {ACCENT_COLORS.map((color) => {
                const active = accent === color.key
                return (
                  <button
                    key={color.key}
                    type="button"
                    title={color.label}
                    aria-label={color.label}
                    onClick={() => updateAccent(color.key)}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full transition-transform hover:scale-105",
                      active &&
                        "ring-2 ring-ring ring-offset-2 ring-offset-background"
                    )}
                    style={{ backgroundColor: color.swatch }}
                  >
                    {active && (
                      <IconCheck className="size-5 text-white" stroke={3} />
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {ACCENT_COLORS.map((color) => (
                <Skeleton key={color.key} className="size-10 rounded-full" />
              ))}
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          title="Tamaño de fuente"
          description="Escala el texto y el espaciado en toda la app."
        >
          {ready ? (
            <div className="grid grid-cols-4 gap-3 sm:max-w-md">
              {FONT_SIZES.map((size) => {
                const active = settings.fontSize === size.key
                return (
                  <button
                    key={size.key}
                    type="button"
                    onClick={() => update({ fontSize: size.key })}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-4 transition-colors hover:bg-muted",
                      active
                        ? "border-primary ring-2 ring-ring ring-offset-2 ring-offset-background"
                        : "border-border"
                    )}
                  >
                    <span
                      className="font-semibold"
                      style={{ fontSize: size.px }}
                    >
                      A
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fontSizeLabels[size.key]}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 sm:max-w-md">
              {FONT_SIZES.map((size) => (
                <Skeleton
                  key={size.key}
                  className="flex flex-col items-center gap-1 rounded-lg border border-transparent p-4"
                >
                  <span
                    className="invisible font-semibold"
                    style={{ fontSize: size.px }}
                  >
                    A
                  </span>
                  <span className="invisible text-xs">
                    {fontSizeLabels[size.key]}
                  </span>
                </Skeleton>
              ))}
            </div>
          )}
        </SettingsSection>
      </SettingsSectionList>
    </div>
  )
}
