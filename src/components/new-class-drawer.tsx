import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { zodFormResolver } from "@/lib/form"
import { z } from "zod"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { IconCalendar } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { DrawerSubmitButton } from "@/components/drawer-submit-button"
import { useSubmitLifecycle } from "@/hooks/use-submit-lifecycle"
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
import { Label } from "@/components/ui/label"
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
import {
  createClass,
  createClassSeries,
  updateClass,
  updateClassSeries,
} from "@/lib/classes.functions"
import type { SeriesScope } from "@/lib/classes.functions"
import type { SpaceRecord } from "@/lib/spaces.functions"
import type { ActivityRecord } from "@/lib/activities.functions"
import { spaceDisplayName, spaceNounKey } from "@/lib/activities/spaces"
import {
  activityDisplayName,
  activityProvides,
} from "@/lib/activities/templates"
import { sessionDurations } from "@/lib/activities/config"
import { durationLabel } from "@/lib/duration-label"
import { appErrorPayload, translateError } from "@/lib/errors"
import type { CoachRecord } from "@/lib/coaches.functions"
import {
  describeRule,
  fullDateLabel,
  monthlyOptions,
  presetLabel,
  presetRules,
  sameRecurrence,
  seriesPreview,
  shiftWeekdays,
} from "@/lib/recurrence"
import type { PresetId, RecurrenceRule } from "@/lib/recurrence"
import { calendarDaysBetween } from "@/lib/tz"
import { RecurrenceDialog } from "@/components/recurrence-dialog"
import { SeriesScopeDialog } from "@/components/series-scope-dialog"
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

// "" = no limit; otherwise a whole number of places.
function isCapacity(value: string): boolean {
  if (value === "") return true
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 500
}

function makeSchema(t: TFunction) {
  return z.object({
    activityId: z.string().min(1, t("validation.activityRequired")),
    coachId: z.string().min(1, t("validation.coachRequired")),
    spaceId: z.string().min(1, t("validation.spaceRequired")),
    date: z.date({ error: t("validation.dateRequired") }),
    time: z.string().min(1, t("validation.timeRequired")),
    duration: z.string().min(1, t("validation.durationRequired")),
    capacity: z.string().refine(isCapacity, t("validation.capacityRange")),
  })
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>
type FormInput = Omit<FormValues, "date"> & { date?: Date }

export interface ClassData {
  id?: string
  activityId: string
  coachId: string | null
  spaceId: string
  date: string
  startTime: string
  durationMinutes: number
  capacity: number | null
  // The series the class belongs to, if it repeats.
  series?: { id: string; rule: RecurrenceRule } | null
}

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

function capacityValue(capacity: number | null | undefined): string {
  return capacity == null ? "" : String(capacity)
}

// A new class: the activity is preset when there's only one to choose.
function emptyValues(activity: ActivityRecord | undefined): FormInput {
  return {
    activityId: activity?.id ?? "",
    coachId: "",
    spaceId: "",
    time: "",
    duration: "",
    capacity: capacityValue(activity?.config.sessions?.defaultCapacity),
  }
}

// The Repeat select's value: a preset, or the rule from Custom….
type Repeat = PresetId | "custom"
const CUSTOMIZE = "customize"

// A custom rule follows the start date; a monthly option that the new date
// doesn't have falls back to its day of the month.
function withStartDate(rule: RecurrenceRule, date: string): RecurrenceRule {
  return {
    ...rule,
    startDate: date,
    monthlyBy:
      rule.monthlyBy && !monthlyOptions(date).includes(rule.monthlyBy)
        ? "day_of_month"
        : rule.monthlyBy,
  }
}

function toFormValues(c: ClassData): FormInput {
  return {
    activityId: c.activityId,
    coachId: c.coachId ?? "",
    spaceId: c.spaceId,
    date: parseISO(c.date),
    time: c.startTime,
    duration: String(c.durationMinutes),
    capacity: capacityValue(c.capacity),
  }
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
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen
  const isEditing = !!coachClass
  const series = coachClass?.series ?? null

  // Activities that run classes, plus this class's own even if since disabled.
  const sessionActivities = activities.filter(
    (a) => activityProvides(a, "sessions") || a.id === coachClass?.activityId
  )
  const onlyActivity =
    sessionActivities.length === 1 ? sessionActivities[0] : undefined

  const { status, progress, run, reset, schedule } = useSubmitLifecycle()
  const [repeat, setRepeat] = useState<Repeat>("none")
  const [customRule, setCustomRule] = useState<RecurrenceRule | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  // Dates the space is taken on, from the last refused series, and the ones
  // the admin chose to skip.
  const [conflicts, setConflicts] = useState<string[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  // Editing a series' class: the scope chosen on save, the form values
  // waiting for it, and the removals the server asks to confirm.
  const [scopeOpen, setScopeOpen] = useState(false)
  const [scope, setScope] = useState<SeriesScope>("this")
  const [pending, setPending] = useState<FormInput | null>(null)
  const [removals, setRemovals] = useState<{
    classes: number
    signUps: number
  } | null>(null)
  // The series' own rule, until Custom… replaces it: it moves with the date.
  const [customFromSeries, setCustomFromSeries] = useState(false)
  const schema = useMemo(() => makeSchema(t), [t])

  const initialValues = useMemo(
    () => (coachClass ? toFormValues(coachClass) : emptyValues(onlyActivity)),
    [coachClass, onlyActivity]
  )
  const form = useForm<FormInput>({
    resolver: zodFormResolver<FormInput>(schema),
    defaultValues: initialValues,
  })

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
      setRepeat(series ? "custom" : "none")
      setCustomRule(series?.rule ?? null)
      setCustomFromSeries(!!series)
      setConflicts([])
      setSkipped([])
      setPending(null)
      setRemovals(null)
    }
  }, [open, initialValues, form, reset, series])

  const activityId = form.watch("activityId")
  const pickedDate = form.watch("date")
  const startDate = pickedDate ? format(pickedDate, "yyyy-MM-dd") : null
  const presets = useMemo(
    () => (startDate ? presetRules(startDate) : []),
    [startDate]
  )
  const customForDate =
    startDate && customRule
      ? customFromSeries && coachClass
        ? shiftWeekdays(
            withStartDate(customRule, startDate),
            calendarDaysBetween(coachClass.date, startDate)
          )
        : withStartDate(customRule, startDate)
      : null
  const baseRule =
    !startDate || (isEditing && !series)
      ? null
      : repeat === "custom"
        ? customForDate
        : (presets.find((p) => p.id === repeat)?.rule ?? null)
  const rule = baseRule && {
    ...baseRule,
    exdates: [...new Set([...baseRule.exdates, ...skipped])],
  }
  const preview =
    rule && !isEditing && seriesPreview(rule, format(new Date(), "yyyy-MM-dd"))
  // One class can't take a new repeat: then "This class" isn't offered.
  const repeatChanged = !!series && !!rule && !sameRecurrence(rule, series.rule)

  function changeRepeat(value: string) {
    // Radix's hidden native select reports "" when the value switches to
    // "custom" in the same render that adds that option.
    if (!value) return
    if (value === CUSTOMIZE) {
      setCustomOpen(true)
      return
    }
    setRepeat(value as Repeat)
    setConflicts([])
  }
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
  function onSubmit(values: FormInput) {
    if (series && rule) {
      setPending(values)
      setScopeOpen(true)
      return
    }
    save(values, {})
  }

  function save(
    values: FormInput,
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
    let toConfirm: { classes: number; signUps: number } | null = null
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
          coaches.find((c) => c.id === values.coachId)?.name ??
          t("forms.class.fallbackCoach")
        toast.success(
          isEditing
            ? t("forms.class.updated")
            : seriesRule
              ? t("forms.class.seriesCreated")
              : t("forms.class.created"),
          {
            description: t("forms.class.savedDescription", {
              coach: coachName,
            }),
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
        toast.error(t("common.genericError"), {
          // Why it was refused (e.g. the space is taken), when the server
          // says so.
          description: translateError(
            err,
            t,
            t("forms.class.errorDescription")
          ),
        })
      },
    })
  }

  // Resends the series with the conflicting dates left out.
  function skipConflicts() {
    if (!rule) return
    const next = [...skipped, ...conflicts]
    setSkipped(next)
    void form.handleSubmit((values) =>
      save(values, {
        seriesRule: {
          ...rule,
          exdates: [...new Set([...rule.exdates, ...next])],
        },
      })
    )()
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {isEditing ? t("forms.class.titleEdit") : t("forms.class.titleNew")}
          </DrawerTitle>
        </DrawerHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => onSubmit(values))}
            className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-2"
          >
            {/* Only clubs with several activities that run classes pick one. */}
            {!onlyActivity && (
              <FormField
                control={form.control}
                name="activityId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fields.activity")}</FormLabel>
                    <Select onValueChange={changeActivity} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("placeholders.selectActivity")}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sessionActivities.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {activityDisplayName(a, t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="coachId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.coach")}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!activityId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("placeholders.selectCoach")}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activityCoaches.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
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
              name="spaceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(spaceNounKey(courts))}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!activityId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("placeholders.selectSpace")}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {courts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {spaceDisplayName(c, t)}
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
                  <FormLabel>
                    {rule && !isEditing
                      ? t("recurrence.starts")
                      : t("fields.date")}
                  </FormLabel>
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
                            : t("common.pickDate")}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Repeating applies to new classes; a series' own classes are
                edited with their scope choice. */}
            {(!isEditing || series) && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="class-repeat">{t("recurrence.repeat")}</Label>
                <Select
                  value={repeat}
                  onValueChange={changeRepeat}
                  disabled={!startDate}
                >
                  <SelectTrigger id="class-repeat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {presets
                      .filter((preset) => !series || preset.rule)
                      .map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {presetLabel(preset, t)}
                        </SelectItem>
                      ))}
                    {customForDate && (
                      <SelectItem value="custom">
                        {describeRule(customForDate, t)}
                      </SelectItem>
                    )}
                    <SelectItem value={CUSTOMIZE}>
                      {t("recurrence.custom")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {/* The select already shows the rule; this says what it
                    creates. */}
                {preview && (
                  <p className="text-sm text-muted-foreground">
                    {preview.capped
                      ? t("recurrence.firstYearCount", { count: preview.count })
                      : t("recurrence.classCount", { count: preview.count })}
                  </p>
                )}
                {startDate && (
                  <RecurrenceDialog
                    open={customOpen}
                    onOpenChange={setCustomOpen}
                    startDate={startDate}
                    initial={rule}
                    onSave={(saved) => {
                      setCustomRule(saved)
                      setCustomFromSeries(false)
                      setRepeat("custom")
                      setConflicts([])
                    }}
                  />
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fields.startTime")}</FormLabel>
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
                    <FormLabel>{t("fields.duration")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("placeholders.duration")}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {durations.map((minutes) => (
                          <SelectItem key={minutes} value={String(minutes)}>
                            {durationLabel(minutes, t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.capacity")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder={t("placeholders.noLimit")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {conflicts.length > 0 && (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
              >
                <p>{t("recurrence.conflictsTitle")}</p>
                <ul className="max-h-32 list-disc overflow-y-auto pl-5">
                  {conflicts.map((date) => (
                    <li key={date}>{fullDateLabel(date, t)}</li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={status === "submitting"}
                  onClick={skipConflicts}
                >
                  {t("recurrence.skipConflicts")}
                </Button>
              </div>
            )}

            <DrawerFooter className="px-0 pt-4">
              <DrawerSubmitButton
                status={status}
                progress={progress}
                label={
                  isEditing
                    ? t("common.saveChanges")
                    : t("forms.class.submitNew")
                }
              />
              <DrawerClose asChild>
                <Button variant="outline" disabled={status === "submitting"}>
                  {t("common.cancel")}
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </Form>
        {series && (
          <SeriesScopeDialog
            open={scopeOpen}
            onOpenChange={setScopeOpen}
            title={t("recurrence.scope.editTitle")}
            actionLabel={t("recurrence.scope.ok")}
            allowThis={!repeatChanged}
            onConfirm={(chosen) => {
              setScope(chosen)
              if (pending) save(pending, { saveScope: chosen })
            }}
          />
        )}
        <AlertDialog
          open={!!removals}
          onOpenChange={(next) => {
            if (!next) setRemovals(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("recurrence.removeConfirm.title")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("recurrence.removeConfirm.description", {
                  classes: removals?.classes ?? 0,
                  signUps: removals?.signUps ?? 0,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setRemovals(null)
                  if (pending) save(pending, { confirmed: true })
                }}
              >
                {t("recurrence.removeConfirm.action")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DrawerContent>
    </Drawer>
  )
}
