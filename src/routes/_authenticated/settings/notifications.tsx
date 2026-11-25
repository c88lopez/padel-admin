import { useMemo } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { IconBrandWhatsapp, IconMail } from "@tabler/icons-react"
import { ensurePermission } from "@/lib/route-guards"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  SettingsSection,
  SettingsSectionList,
} from "@/components/settings-section"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  DEFAULT_APP_SETTINGS,
  REMINDER_OFFSETS,
  setAppSettings,
  useAppSettings,
  useAppSettingsHydrated,
} from "@/lib/app-settings"
import type { NotificationSettings } from "@/lib/app-settings"

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  beforeLoad: ({ context }) =>
    ensurePermission(context.user.role, "settings:manage"),
  component: NotificationsSettingsPage,
})

const OFFSET_LABEL_KEYS = {
  1: "1 hora",
  2: "2 horas",
  24: "1 día",
  48: "2 días",
} as const

function buildReminderOffsets(): { hours: number; label: string }[] {
  return REMINDER_OFFSETS.map((offset) => ({
    hours: offset.hours,
    label: OFFSET_LABEL_KEYS[offset.hours as keyof typeof OFFSET_LABEL_KEYS],
  }))
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  icon,
  loading,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  icon?: React.ReactNode
  loading?: boolean
}) {
  return (
    <div className="flex items-start gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
      {loading ? (
        <Skeleton className="mt-0.5 h-5 w-9 rounded-full" />
      ) : (
        <Switch
          className="mt-0.5"
          checked={checked}
          onCheckedChange={onChange}
        />
      )}
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function NotificationsSettingsPage() {
  const settings = useAppSettings()
  // Per-club settings load from localStorage after mount; until then show a
  // skeleton so the switches don't flash from default to real values.
  const ready = useAppSettingsHydrated()
  const { notifications } = settings
  const reminderOffsets = useMemo(() => buildReminderOffsets(), [])

  function update(partial: Partial<NotificationSettings>) {
    setAppSettings({
      ...settings,
      notifications: { ...notifications, ...partial },
    })
  }

  function toggleOffset(hours: number) {
    const has = notifications.reminderOffsets.includes(hours)
    update({
      reminderOffsets: has
        ? notifications.reminderOffsets.filter((h) => h !== hours)
        : [...notifications.reminderOffsets, hours].sort((a, b) => b - a),
    })
  }

  function reset() {
    setAppSettings({
      ...settings,
      notifications: DEFAULT_APP_SETTINGS.notifications,
    })
    toast.success(
      "Configuración de notificaciones restablecida a los valores predeterminados"
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Notificaciones</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Elige cómo y cuándo se notifica a jugadores y personal.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          Restablecer valores predeterminados
        </Button>
      </div>

      <SettingsSectionList>
        <SettingsSection
          title="Canales"
          description="Métodos de entrega para las notificaciones salientes."
        >
          <div className="flex flex-col">
            <ToggleRow
              loading={!ready}
              title="Correo electrónico"
              description="Enviar notificaciones por correo electrónico."
              icon={<IconMail className="size-5" />}
              checked={notifications.channels.email}
              onChange={(checked) =>
                update({
                  channels: { ...notifications.channels, email: checked },
                })
              }
            />
            <ToggleRow
              loading={!ready}
              title="WhatsApp"
              description="Enviar notificaciones por WhatsApp."
              icon={<IconBrandWhatsapp className="size-5" />}
              checked={notifications.channels.whatsapp}
              onChange={(checked) =>
                update({
                  channels: { ...notifications.channels, whatsapp: checked },
                })
              }
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Eventos"
          description="Qué eventos de reserva activan una notificación."
        >
          <div className="flex flex-col">
            <ToggleRow
              loading={!ready}
              title="Confirmaciones de reserva"
              description="Cuando se crea una reserva."
              checked={notifications.events.confirmations}
              onChange={(checked) =>
                update({
                  events: { ...notifications.events, confirmations: checked },
                })
              }
            />
            <ToggleRow
              loading={!ready}
              title="Recordatorios"
              description="Antes de una próxima reserva."
              checked={notifications.events.reminders}
              onChange={(checked) =>
                update({
                  events: { ...notifications.events, reminders: checked },
                })
              }
            />
            <ToggleRow
              loading={!ready}
              title="Cancelaciones"
              description="Cuando se cancela una reserva."
              checked={notifications.events.cancellations}
              onChange={(checked) =>
                update({
                  events: { ...notifications.events, cancellations: checked },
                })
              }
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Tiempo de recordatorio"
          description="Envía recordatorios con esta antelación al inicio de la reserva."
        >
          <div className="flex flex-wrap gap-2">
            {reminderOffsets.map((offset) => {
              const active = notifications.reminderOffsets.includes(
                offset.hours
              )
              if (!ready) {
                return (
                  <Skeleton
                    key={offset.hours}
                    className="rounded-full border border-transparent px-4 py-1.5 text-sm"
                  >
                    <span className="invisible">{`${offset.label} antes`}</span>
                  </Skeleton>
                )
              }
              return (
                <button
                  key={offset.hours}
                  type="button"
                  disabled={!notifications.events.reminders}
                  onClick={() => toggleOffset(offset.hours)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {`${offset.label} antes`}
                </button>
              )
            })}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Notificaciones en la app"
          description="Qué eventos aparecen en el menú de notificaciones."
        >
          <div className="flex flex-col">
            <ToggleRow
              loading={!ready}
              title="Reservas"
              description="Reservas nuevas y actualizadas."
              checked={notifications.inApp.bookings}
              onChange={(checked) =>
                update({ inApp: { ...notifications.inApp, bookings: checked } })
              }
            />
            <ToggleRow
              loading={!ready}
              title="Pagos"
              description="Actividad de ventas y pagos."
              checked={notifications.inApp.payments}
              onChange={(checked) =>
                update({ inApp: { ...notifications.inApp, payments: checked } })
              }
            />
            <ToggleRow
              loading={!ready}
              title="Stock bajo"
              description="Cuando el inventario cae por debajo del umbral."
              checked={notifications.inApp.lowStock}
              onChange={(checked) =>
                update({ inApp: { ...notifications.inApp, lowStock: checked } })
              }
            />
            <ToggleRow
              loading={!ready}
              title="Sistema"
              description="Actualizaciones del producto y avisos de mantenimiento."
              checked={notifications.inApp.system}
              onChange={(checked) =>
                update({ inApp: { ...notifications.inApp, system: checked } })
              }
            />
          </div>
        </SettingsSection>
      </SettingsSectionList>
    </div>
  )
}
