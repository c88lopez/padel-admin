import { useEffect, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { ensurePermission } from "@/lib/route-guards"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  SettingsSection,
  SettingsSectionList,
} from "@/components/settings-section"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { clampNumber, TIMEZONES } from "@/lib/app-settings"
import {
  DEFAULT_RESERVATION_SETTINGS,
  SLOT_DURATIONS,
  WEEKDAYS,
} from "@/lib/reservation-settings"
import type { DayHours, Weekday } from "@/lib/reservation-settings"
import {
  getReservationSettings,
  updateReservationSettings,
} from "@/lib/reservation-settings.functions"
import type { ReservationSettingsData } from "@/lib/reservation-settings.functions"

export const Route = createFileRoute("/_authenticated/settings/reservations")({
  beforeLoad: ({ context }) =>
    ensurePermission(context.user.role, "settings:manage"),
  loader: async () => ({
    settings: await getReservationSettings(),
  }),
  component: ReservationSettingsPage,
})

function ReservationSettingsPage() {
  const router = useRouter()
  const { settings: loadedSettings } = Route.useLoaderData()
  // Local mirror of the DB reservation settings (hours + rules), saved to the
  // server on change (selects/switches) or on blur (text/number inputs).
  const [reservations, setReservations] =
    useState<ReservationSettingsData>(loadedSettings)

  useEffect(() => setReservations(loadedSettings), [loadedSettings])

  // Persists the full settings blob; reverts (via refetch) on failure.
  async function persistSettings(next: ReservationSettingsData) {
    try {
      await updateReservationSettings({ data: next })
    } catch {
      toast.error("Algo salió mal", {
        description: "Inténtalo de nuevo.",
      })
      router.invalidate()
    }
  }

  // Update local state only (for typing in inputs); persisted on blur via flush.
  function updateLocal(partial: Partial<ReservationSettingsData>) {
    setReservations((prev) => ({ ...prev, ...partial }))
  }

  // Update local state and persist immediately (for selects/switches).
  function commit(partial: Partial<ReservationSettingsData>) {
    setReservations((prev) => {
      const next = { ...prev, ...partial }
      void persistSettings(next)
      return next
    })
  }

  // Persist the current local state without changing it (input onBlur).
  function flush() {
    setReservations((prev) => {
      void persistSettings(prev)
      return prev
    })
  }

  function updateDayLocal(day: Weekday, partial: Partial<DayHours>) {
    setReservations((prev) => ({
      ...prev,
      hours: { ...prev.hours, [day]: { ...prev.hours[day], ...partial } },
    }))
  }

  function commitDay(day: Weekday, partial: Partial<DayHours>) {
    setReservations((prev) => {
      const next = {
        ...prev,
        hours: { ...prev.hours, [day]: { ...prev.hours[day], ...partial } },
      }
      void persistSettings(next)
      return next
    })
  }

  function reset() {
    const next = DEFAULT_RESERVATION_SETTINGS
    setReservations(next)
    void persistSettings(next)
    toast.success(
      "Configuración de reservas restablecida a los valores predeterminados"
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Reservas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Horario de apertura y reglas de reserva.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          Restablecer valores predeterminados
        </Button>
      </div>

      <SettingsSectionList>
        <SettingsSection
          title="Horario de apertura"
          description="Las reservas fuera de este horario se rechazan. También define el rango visible del cronograma de reservas."
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 border-b pb-4 sm:max-w-xs">
              <Label>Zona horaria</Label>
              <Select
                value={reservations.timezone}
                onValueChange={(v) => commit({ timezone: v })}
              >
                <SelectTrigger className="h-8">
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
            </div>
            {WEEKDAYS.map((day) => {
              const value = reservations.hours[day.key]
              const invalid = !value.closed && value.open >= value.close
              return (
                <div
                  key={day.key}
                  className="flex flex-col gap-1 border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-24 text-sm font-medium">
                      {day.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!value.closed}
                        onCheckedChange={(checked) =>
                          commitDay(day.key, { closed: !checked })
                        }
                      />
                      <span className="w-12 text-xs text-muted-foreground">
                        {value.closed ? "Cerrado" : "Abierto"}
                      </span>
                    </div>
                    <Input
                      type="time"
                      value={value.open}
                      disabled={value.closed}
                      aria-invalid={invalid}
                      onChange={(e) =>
                        updateDayLocal(day.key, { open: e.target.value })
                      }
                      onBlur={flush}
                      className="h-8 w-32"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={value.close}
                      disabled={value.closed}
                      aria-invalid={invalid}
                      onChange={(e) =>
                        updateDayLocal(day.key, { close: e.target.value })
                      }
                      onBlur={flush}
                      className="h-8 w-32"
                    />
                  </div>
                  {invalid && (
                    <p className="pl-24 text-xs text-destructive">
                      La hora de cierre debe ser posterior a la de apertura.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Franjas"
          description="Granularidad y duración predeterminadas para nuevas reservas."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Duración de la franja</Label>
              <Select
                value={String(reservations.slotDuration)}
                onValueChange={(v) => commit({ slotDuration: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOT_DURATIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {`${m} minutos`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="defaultBookingLength">
                Duración de reserva predeterminada (min)
              </Label>
              <Input
                id="defaultBookingLength"
                type="number"
                min={30}
                step={30}
                value={reservations.defaultBookingLength}
                onChange={(e) =>
                  updateLocal({
                    defaultBookingLength: clampNumber(e.target.value, 30),
                  })
                }
                onBlur={flush}
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Reglas de reserva"
          description="Restricciones aplicadas cuando los jugadores reservan o cancelan."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="minAdvanceHours">Antelación mínima (horas)</Label>
              <Input
                id="minAdvanceHours"
                type="number"
                min={0}
                value={reservations.minAdvanceHours}
                onChange={(e) =>
                  updateLocal({
                    minAdvanceHours: clampNumber(e.target.value, 0),
                  })
                }
                onBlur={flush}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="maxAdvanceDays">Antelación máxima (días)</Label>
              <Input
                id="maxAdvanceDays"
                type="number"
                min={1}
                value={reservations.maxAdvanceDays}
                onChange={(e) =>
                  updateLocal({
                    maxAdvanceDays: clampNumber(e.target.value, 1),
                  })
                }
                onBlur={flush}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cancellationCutoffHours">
                Límite de cancelación (horas)
              </Label>
              <Input
                id="cancellationCutoffHours"
                type="number"
                min={0}
                value={reservations.cancellationCutoffHours}
                onChange={(e) =>
                  updateLocal({
                    cancellationCutoffHours: clampNumber(e.target.value, 0),
                  })
                }
                onBlur={flush}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="maxConcurrentPerPlayer">
                Máx. de reservas activas por jugador
              </Label>
              <Input
                id="maxConcurrentPerPlayer"
                type="number"
                min={1}
                value={reservations.maxConcurrentPerPlayer}
                onChange={(e) =>
                  updateLocal({
                    maxConcurrentPerPlayer: clampNumber(e.target.value, 1),
                  })
                }
                onBlur={flush}
              />
            </div>
          </div>
        </SettingsSection>
      </SettingsSectionList>
    </div>
  )
}
