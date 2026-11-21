import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
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
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { createCoach, updateCoach } from "@/lib/coaches.functions"
import type { ActivityRecord } from "@/lib/activities.functions"
import {
  activityDisplayName,
  activityProvides,
} from "@/lib/activities/templates"
import { translateError } from "@/lib/errors"

// `pickActivities`: the club has several activities with classes, so the
// coach's must be chosen (with one, it's given automatically).
function makeSchema(t: TFunction, pickActivities: boolean) {
  return z.object({
    name: z.string().min(1, t("validation.nameRequired")),
    phone: z.string().min(1, t("validation.phoneRequired")),
    birthday: z.date().optional(),
    activityIds: pickActivities
      ? z.array(z.string()).min(1, t("errors.coach.activityRequired"))
      : z.array(z.string()),
  })
}

type FormInput = z.infer<ReturnType<typeof makeSchema>>

export interface CoachData {
  name: string
  phone: string
  birthday?: Date
  activityIds: string[]
}

interface Props {
  trigger?: React.ReactNode
  coach?: CoachData & { id?: string }
  activities: ActivityRecord[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: () => void
}

export function NewCoachDrawer({
  trigger,
  coach,
  activities,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen
  const isEditing = !!coach

  // Activities with classes, the ones a coach can be given.
  const teachable = activities.filter((a) => activityProvides(a, "sessions"))
  const pickActivities = teachable.length > 1

  const { status, progress, run, reset, schedule } = useSubmitLifecycle()
  const schema = useMemo(
    () => makeSchema(t, pickActivities),
    [t, pickActivities]
  )

  const initialValues = useMemo<FormInput>(
    () => coach ?? { name: "", phone: "", activityIds: [] },
    [coach]
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

  function onSubmit(values: FormInput) {
    const payload = {
      name: values.name,
      phone: values.phone,
      birthday: values.birthday ? format(values.birthday, "yyyy-MM-dd") : null,
      // Only sent when chosen; otherwise the server gives a new coach the
      // club's only activity with classes and leaves an edited one's alone.
      ...(pickActivities && {
        activityIds: values.activityIds.filter((id) =>
          teachable.some((a) => a.id === id)
        ),
      }),
    }
    run({
      action: () =>
        coach?.id
          ? updateCoach({ data: { id: coach.id, ...payload } })
          : createCoach({ data: payload }),
      onSuccess: () => {
        toast.success(
          isEditing ? t("forms.coach.updated") : t("forms.coach.created"),
          {
            description: t("common.savedSuccess", { name: values.name }),
          }
        )
        onSaved?.()
        schedule(() => setOpen(false), 900)
      },
      onError: (err) => {
        toast.error(t("common.genericError"), {
          description: translateError(
            err,
            t,
            t("forms.coach.errorDescription")
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
            {isEditing ? t("forms.coach.titleEdit") : t("forms.coach.titleNew")}
          </DrawerTitle>
        </DrawerHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-2"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.fullName")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("forms.coach.namePlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.phone")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("forms.coach.phonePlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {pickActivities && (
              <FormField
                control={form.control}
                name="activityIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("forms.coach.activitiesLabel")}</FormLabel>
                    <div className="flex flex-col gap-2 rounded-md border p-3">
                      {teachable.map((a) => {
                        const checked = field.value.includes(a.id)
                        const name = activityDisplayName(a, t)
                        return (
                          <label
                            key={a.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            {name}
                            <Switch
                              checked={checked}
                              aria-label={name}
                              onCheckedChange={(on) =>
                                field.onChange(
                                  on
                                    ? [...field.value, a.id]
                                    : field.value.filter((id) => id !== a.id)
                                )
                              }
                            />
                          </label>
                        )
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="birthday"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("forms.coach.birthdayLabel")}</FormLabel>
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

            <DrawerFooter className="px-0 pt-4">
              <DrawerSubmitButton
                status={status}
                progress={progress}
                label={
                  isEditing
                    ? t("common.saveChanges")
                    : t("forms.coach.submitNew")
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
