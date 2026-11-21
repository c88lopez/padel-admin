import { useEffect, useMemo, useState } from "react"
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
import { createClass, updateClass } from "@/lib/classes.functions"
import type { SpaceRecord } from "@/lib/spaces.functions"
import type { ActivityRecord } from "@/lib/activities.functions"
import { spaceDisplayName, spaceNounKey } from "@/lib/activities/spaces"
import {
  activityDisplayName,
  activityProvides,
} from "@/lib/activities/templates"
import { sessionDurations } from "@/lib/activities/config"
import { durationLabel } from "@/lib/duration-label"
import { translateError } from "@/lib/errors"
import type { CoachRecord } from "@/lib/coaches.functions"

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

  // Activities that run classes, plus this class's own even if since disabled.
  const sessionActivities = activities.filter(
    (a) => activityProvides(a, "sessions") || a.id === coachClass?.activityId
  )
  const onlyActivity =
    sessionActivities.length === 1 ? sessionActivities[0] : undefined

  const { status, progress, run, reset, schedule } = useSubmitLifecycle()
  const schema = useMemo(() => makeSchema(t), [t])

  const initialValues = useMemo(
    () => (coachClass ? toFormValues(coachClass) : emptyValues(onlyActivity)),
    [coachClass, onlyActivity]
  )
  const form = useForm<FormInput>({
    resolver: zodFormResolver<FormInput>(schema),
    defaultValues: initialValues,
  })

  useEffect(() => {
    if (open) {
      form.reset(initialValues)
      reset()
    }
  }, [open, initialValues, form, reset])

  const activityId = form.watch("activityId")
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

  function onSubmit(values: FormInput) {
    const payload = {
      coachId: values.coachId,
      spaceId: values.spaceId,
      date: format(values.date as Date, "yyyy-MM-dd"),
      startTime: values.time,
      durationMinutes: Number(values.duration),
      capacity: values.capacity === "" ? null : Number(values.capacity),
    }
    run({
      action: () =>
        coachClass?.id
          ? updateClass({ data: { id: coachClass.id, ...payload } })
          : createClass({ data: payload }),
      onSuccess: () => {
        const coachName =
          coaches.find((c) => c.id === values.coachId)?.name ??
          t("forms.class.fallbackCoach")
        toast.success(
          isEditing ? t("forms.class.updated") : t("forms.class.created"),
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
            onSubmit={form.handleSubmit(onSubmit)}
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
                  <FormLabel>{t("fields.date")}</FormLabel>
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
      </DrawerContent>
    </Drawer>
  )
}
