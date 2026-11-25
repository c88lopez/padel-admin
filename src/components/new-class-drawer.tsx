import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { format } from "date-fns"
import { toast } from "sonner"
import { zodFormResolver } from "@/lib/form"
import { Button } from "@/components/ui/button"
import { DrawerSubmitButton } from "@/components/drawer-submit-button"
import { useSubmitLifecycle } from "@/hooks/use-submit-lifecycle"
import { useClassRecurrence } from "@/hooks/use-class-recurrence"
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
import { FormSelectField } from "@/components/form-select-field"
import { FormDateField } from "@/components/form-date-field"
import { ClassRepeatField } from "@/components/class-repeat-field"
import { SeriesConflictsAlert } from "@/components/series-conflicts-alert"
import { SeriesRemovalsDialog } from "@/components/series-removals-dialog"
import type { SeriesRemovals } from "@/components/series-removals-dialog"
import { SeriesScopeDialog } from "@/components/series-scope-dialog"
import {
  createClass,
  createClassSeries,
  updateClass,
  updateClassSeries,
} from "@/lib/classes.functions"
import type { SeriesScope } from "@/lib/classes.functions"
import type { SpaceRecord } from "@/lib/spaces.functions"
import type { ActivityRecord } from "@/lib/activities.functions"
import { spaceDisplayName, spaceNoun } from "@/lib/activities/spaces"
import {
  activityDisplayName,
  activityProvides,
} from "@/lib/activities/templates"
import { sessionDurations } from "@/lib/activities/config"
import { durationLabel } from "@/lib/duration-label"
import { appErrorPayload, errorMessage } from "@/lib/errors"
import type { CoachRecord } from "@/lib/coaches.functions"
import type { RecurrenceRule } from "@/lib/recurrence"
import {
  capacityValue,
  emptyClassValues,
  makeClassSchema,
  toClassFormValues,
} from "@/lib/class-form"
import type { ClassData, ClassFormInput } from "@/lib/class-form"

interface Props {
  trigger?: React.ReactNode
  coaches: CoachRecord[]
  courts: SpaceRecord[]
  activities: ActivityRecord[]
  coachClass?: ClassData
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: () => void
}

export function NewClassDrawer({
  trigger,
  coaches,
  courts: allCourts,
  activities,
  coachClass,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSaved,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen
  const isEditing = !!coachClass

  // Activities that run classes, plus this class's own even if since disabled.
  const sessionActivities = activities.filter(
    (a) => activityProvides(a, "sessions") || a.id === coachClass?.activityId
  )
  const onlyActivity =
    sessionActivities.length === 1 ? sessionActivities[0] : undefined

  const { status, progress, run, reset, schedule } = useSubmitLifecycle()
  // Editing a series' class: the scope chosen on save, the form values
  // waiting for it, and the removals the server asks to confirm.
  const [scopeOpen, setScopeOpen] = useState(false)
  const [scope, setScope] = useState<SeriesScope>("this")
  const [pending, setPending] = useState<ClassFormInput | null>(null)
  const [removals, setRemovals] = useState<SeriesRemovals | null>(null)
  const schema = useMemo(() => makeClassSchema(), [])

  const initialValues = useMemo(
    () =>
      coachClass
        ? toClassFormValues(coachClass)
        : emptyClassValues(onlyActivity),
    [coachClass, onlyActivity]
  )
  const form = useForm<ClassFormInput>({
    resolver: zodFormResolver<ClassFormInput>(schema),
    defaultValues: initialValues,
  })

  const activityId = form.watch("activityId")
  const pickedDate = form.watch("date")
  const startDate = pickedDate ? format(pickedDate, "yyyy-MM-dd") : null
  const recurrence = useClassRecurrence(coachClass, startDate)
  const { series, rule, setConflicts } = recurrence
  const resetRecurrence = recurrence.reset

  // Resets when the drawer opens, not when the page reloads its data while
  // it's open (saving does that): a reset then would cancel the scheduled
  // close and empty the form.
  const wasOpen = useRef(false)
  useEffect(() => {
    const opening = open && !wasOpen.current
    wasOpen.current = open
    if (opening) {
      form.reset(initialValues)
      reset()
      resetRecurrence()
      setPending(null)
      setRemovals(null)
    }
  }, [open, initialValues, form, reset, resetRecurrence])

  // The chosen activity's active spaces, plus this class's current space even
  // if since deactivated.
  const courts = allCourts.filter(
    (c) =>
      c.activityId === activityId && (c.active || c.id === coachClass?.spaceId)
  )
  // Coaches who teach the chosen activity, plus this class's current coach.
  const activityCoaches = coaches.filter(
    (c) => c.activityIds.includes(activityId) || c.id === coachClass?.coachId
  )
  const durations = useMemo(
    () =>
      sessionDurations(
        activities,
        activityId,
        coachClass?.activityId === activityId
          ? coachClass.durationMinutes
          : undefined
      ),
    [activities, activityId, coachClass]
  )

  // Switching activity clears what belongs to the old one and takes the new
  // one's default capacity.
  function changeActivity(id: string) {
    const next = activities.find((a) => a.id === id)
    form.setValue("activityId", id, { shouldValidate: true })
    form.setValue("spaceId", "")
    if (
      !coaches
        .find((c) => c.id === form.getValues("coachId"))
        ?.activityIds.includes(id)
    ) {
      form.setValue("coachId", "")
    }
    if (
      !sessionDurations(activities, id).includes(
        Number(form.getValues("duration"))
      )
    ) {
      form.setValue("duration", "")
    }
    form.setValue(
      "capacity",
      capacityValue(next?.config.sessions?.defaultCapacity)
    )
  }

  // A series' class asks which classes the change is for first.
  function onSubmit(values: ClassFormInput) {
    if (series && rule) {
      setPending(values)
      setScopeOpen(true)
      return
    }
    save(values, {})
  }

  function save(
    values: ClassFormInput,
    {
      seriesRule = rule,
      saveScope = scope,
      confirmed = false,
    }: {
      seriesRule?: RecurrenceRule | null
      saveScope?: SeriesScope
      confirmed?: boolean
    }
  ) {
    const fields = {
      coachId: values.coachId,
      spaceId: values.spaceId,
      startTime: values.time,
      durationMinutes: Number(values.duration),
      capacity: values.capacity === "" ? null : Number(values.capacity),
    }
    const payload = {
      ...fields,
      date: format(values.date as Date, "yyyy-MM-dd"),
    }
    setConflicts([])
    // Set when the server wants removals confirmed instead of saving.
    let toConfirm: SeriesRemovals | null = null
    run({
      action: async () => {
        if (!coachClass?.id) {
          return seriesRule
            ? createClassSeries({ data: { ...fields, rule: seriesRule } })
            : createClass({ data: payload })
        }
        if (!series || !seriesRule || saveScope === "this") {
          return updateClass({ data: { id: coachClass.id, ...payload } })
        }
        const result = await updateClassSeries({
          data: {
            id: coachClass.id,
            scope: saveScope,
            ...payload,
            rule: seriesRule,
            confirmed,
          },
        })
        if (!result.saved) {
          toConfirm = {
            classes: result.removedClasses,
            signUps: result.removedSignUps,
          }
        }
      },
      onSuccess: () => {
        if (toConfirm) {
          reset()
          setPending(values)
          setRemovals(toConfirm)
          return
        }
        const coachName =
          coaches.find((c) => c.id === values.coachId)?.name ?? "entrenador"
        toast.success(
          isEditing
            ? "Clase actualizada"
            : seriesRule
              ? "Clase recurrente programada"
              : "Clase programada",
          {
            description: `La clase con ${coachName} se ha guardado.`,
          }
        )
        onSaved?.()
        schedule(() => setOpen(false), 900)
      },
      onError: (err) => {
        // The series' space is taken on some dates: offer to skip them.
        const refused = appErrorPayload(err)
        if (
          refused?.code.startsWith("errors.class.seriesConflicts") &&
          typeof refused.params?.all === "string"
        ) {
          setConflicts(refused.params.all.split(","))
          return
        }
        toast.error("Algo salió mal", {
          // Why it was refused (e.g. the space is taken), when the server
          // says so.
          description: errorMessage(
            err,
            "No se pudo guardar la clase. Inténtalo de nuevo."
          ),
        })
      },
    })
  }

  // Resends the series with the conflicting dates left out.
  function skipConflicts() {
    const seriesRule = recurrence.skipConflicts()
    if (!seriesRule) return
    void form.handleSubmit((values) => save(values, { seriesRule }))()
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {isEditing ? "Editar clase" : "Nueva clase"}
          </DrawerTitle>
        </DrawerHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => onSubmit(values))}
            className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-2"
          >
            {/* Only clubs with several activities that run classes pick one. */}
            {!onlyActivity && (
              <FormSelectField
                control={form.control}
                name="activityId"
                label="Actividad"
                placeholder="Selecciona una actividad"
                onValueChange={changeActivity}
                options={sessionActivities.map((a) => ({
                  value: a.id,
                  label: activityDisplayName(a),
                }))}
              />
            )}

            <FormSelectField
              control={form.control}
              name="coachId"
              label="Entrenador"
              placeholder="Selecciona un entrenador"
              disabled={!activityId}
              options={activityCoaches.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />

            <FormSelectField
              control={form.control}
              name="spaceId"
              label={spaceNoun(courts)}
              placeholder="Selecciona un espacio"
              disabled={!activityId}
              options={courts.map((c) => ({
                value: c.id,
                label: spaceDisplayName(c),
              }))}
            />

            <FormDateField
              control={form.control}
              name="date"
              label={rule && !isEditing ? "Empieza" : "Fecha"}
            />

            {/* Repeating applies to new classes; a series' own classes are
                edited with their scope choice. */}
            {(!isEditing || series) && (
              <ClassRepeatField recurrence={recurrence} startDate={startDate} />
            )}

            <div className="grid grid-cols-2 gap-4">
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

              <FormSelectField
                control={form.control}
                name="duration"
                label="Duración"
                placeholder="Duración"
                options={durations.map((minutes) => ({
                  value: String(minutes),
                  label: durationLabel(minutes),
                }))}
              />
            </div>

            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capacidad</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="Sin límite"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {recurrence.conflicts.length > 0 && (
              <SeriesConflictsAlert
                dates={recurrence.conflicts}
                disabled={status === "submitting"}
                onSkip={skipConflicts}
              />
            )}

            <DrawerFooter className="px-0 pt-4">
              <DrawerSubmitButton
                status={status}
                progress={progress}
                label={isEditing ? "Guardar cambios" : "Programar clase"}
              />
              <DrawerClose asChild>
                <Button variant="outline" disabled={status === "submitting"}>
                  Cancelar
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </Form>
        {series && (
          <SeriesScopeDialog
            open={scopeOpen}
            onOpenChange={setScopeOpen}
            title="Editar clase recurrente"
            actionLabel="Aceptar"
            allowThis={!recurrence.repeatChanged}
            onConfirm={(chosen) => {
              setScope(chosen)
              if (pending) save(pending, { saveScope: chosen })
            }}
          />
        )}
        <SeriesRemovalsDialog
          removals={removals}
          onCancel={() => setRemovals(null)}
          onConfirm={() => {
            setRemovals(null)
            if (pending) save(pending, { confirmed: true })
          }}
        />
      </DrawerContent>
    </Drawer>
  )
}
