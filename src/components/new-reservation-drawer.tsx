import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodFormResolver } from "@/lib/form"
import { z } from "zod"
import { format } from "date-fns"
import { toast } from "sonner"
import { IconCalendar } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { DrawerSubmitButton } from "@/components/drawer-submit-button"
import { useSubmitLifecycle } from "@/hooks/use-submit-lifecycle"
import {
  createReservation,
  updateReservation,
} from "@/lib/reservations.functions"
import type { SpaceRecord } from "@/lib/spaces.functions"
import { spaceDisplayName, spaceNoun } from "@/lib/activities/spaces"
import type { ActivityRecord } from "@/lib/activities.functions"
import { bookingDurations } from "@/lib/activities/config"
import { durationLabel } from "@/lib/duration-label"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { errorMessage } from "@/lib/errors"

function makeSchema() {
  return z.object({
    player: z.string().min(1, "El jugador es obligatorio"),
    spaceId: z.string().min(1, "El espacio es obligatorio"),
    date: z.date({ error: "La fecha es obligatoria" }),
    time: z.string().min(1, "La hora es obligatoria"),
    duration: z.string().min(1, "La duración es obligatoria"),
    paymentStatus: z.string().min(1, "El estado de pago es obligatorio"),
  })
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>
type FormInput = Omit<FormValues, "date"> & { date?: Date }

export interface ReservationData {
  player: string
  spaceId: string
  date: Date
  time: string
  duration: string
  paymentStatus: string
}

interface Props {
  trigger?: React.ReactNode
  reservation?: ReservationData & { id?: string }
  courts: SpaceRecord[]
  // The club's activities; booking lengths come from the court's activity.
  activities: ActivityRecord[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: () => void
}

export function NewReservationDrawer({
  trigger,
  reservation,
  courts: allCourts,
  activities,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSaved,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen
  const isEditing = !!reservation

  // Show active courts, plus the reservation's current court even if it's since
  // been deactivated (so editing an old booking still displays its court).
  const courts = allCourts.filter(
    (c) => c.active || c.id === reservation?.spaceId
  )

  const { status, progress, run, reset, schedule } = useSubmitLifecycle()
  const schema = useMemo(() => makeSchema(), [])

  const form = useForm<FormInput>({
    resolver: zodFormResolver<FormInput>(schema),
    defaultValues: reservation ?? {
      player: "",
      spaceId: "",
      time: "",
      duration: "",
      paymentStatus: "",
    },
  })

  const spaceId = form.watch("spaceId")
  const durations = useMemo(
    () =>
      bookingDurations(
        activities,
        allCourts.find((c) => c.id === spaceId)?.activityId,
        reservation ? Number(reservation.duration) : undefined
      ),
    [activities, allCourts, spaceId, reservation]
  )

  useEffect(() => {
    if (open) {
      form.reset(
        reservation ?? {
          player: "",
          spaceId: "",
          time: "",
          duration: "",
          paymentStatus: "",
        }
      )
      reset()
    }
  }, [open, reservation, form, reset])

  function onSubmit(values: FormInput) {
    const payload = {
      spaceId: values.spaceId,
      player: values.player,
      date: format(values.date as Date, "yyyy-MM-dd"),
      startTime: values.time,
      durationMinutes: Number(values.duration),
      paymentStatus: values.paymentStatus as "paid" | "partial" | "unpaid",
    }
    run({
      action: () =>
        reservation?.id
          ? updateReservation({ data: { id: reservation.id, ...payload } })
          : createReservation({ data: payload }),
      onSuccess: () => {
        toast.success(isEditing ? "Reserva actualizada" : "Reserva creada", {
          description: `La reserva para ${values.player} se ha guardado.`,
        })
        onSaved?.()
        schedule(() => setOpen(false), 900)
      },
      onError: (error) => {
        toast.error("No se pudo guardar la reserva", {
          description: errorMessage(
            error,
            "No se pudo guardar la reserva. Inténtalo de nuevo."
          ),
        })
      },
    })
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {isEditing ? "Editar reserva" : "Nueva reserva"}
          </DrawerTitle>
        </DrawerHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-2"
          >
            <FormField
              control={form.control}
              name="player"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jugador</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="spaceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{spaceNoun(courts)}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un espacio" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {courts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {spaceDisplayName(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          <IconCalendar className="mr-2 size-4" />
                          {field.value
                            ? format(field.value, "PPP")
                            : "Elige una fecha"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date < new Date(new Date().setHours(0, 0, 0, 0))
                        }
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hora de inicio</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="duration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duración</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona la duración" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {durations.map((minutes) => (
                        <SelectItem key={minutes} value={String(minutes)}>
                          {durationLabel(minutes)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paymentStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pago</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el estado de pago" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="paid">Pagado</SelectItem>
                      <SelectItem value="partial">Pago parcial</SelectItem>
                      <SelectItem value="unpaid">Sin pagar</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DrawerFooter className="px-0 pt-4">
              <DrawerSubmitButton
                status={status}
                progress={progress}
                label={isEditing ? "Guardar cambios" : "Crear reserva"}
              />
              <DrawerClose asChild>
                <Button variant="outline" disabled={status === "submitting"}>
                  Cancelar
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </Form>
      </DrawerContent>
    </Drawer>
  )
}
