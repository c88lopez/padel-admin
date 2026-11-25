import { z } from "zod"
import { parseISO } from "date-fns"
import type { ActivityRecord } from "@/lib/activities.functions"
import { monthlyOptions } from "@/lib/recurrence"
import type { RecurrenceRule } from "@/lib/recurrence"

// The class drawer's form: its schema, values and the rule helpers it shares
// with useClassRecurrence.

// "" = no limit; otherwise a whole number of places.
export function isCapacity(value: string): boolean {
  if (value === "") return true
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 500
}

export function makeClassSchema() {
  return z.object({
    activityId: z.string().min(1, "La actividad es obligatoria"),
    coachId: z.string().min(1, "El entrenador es obligatorio"),
    spaceId: z.string().min(1, "El espacio es obligatorio"),
    date: z.date({ error: "La fecha es obligatoria" }),
    time: z.string().min(1, "La hora es obligatoria"),
    duration: z.string().min(1, "La duración es obligatoria"),
    capacity: z
      .string()
      .refine(
        isCapacity,
        "Ingresa un número del 1 al 500, o déjalo vacío para no poner límite"
      ),
  })
}

type ClassFormValues = z.infer<ReturnType<typeof makeClassSchema>>
export type ClassFormInput = Omit<ClassFormValues, "date"> & { date?: Date }

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

export function capacityValue(capacity: number | null | undefined): string {
  return capacity == null ? "" : String(capacity)
}

// A new class: the activity is preset when there's only one to choose.
export function emptyClassValues(
  activity: ActivityRecord | undefined
): ClassFormInput {
  return {
    activityId: activity?.id ?? "",
    coachId: "",
    spaceId: "",
    time: "",
    duration: "",
    capacity: capacityValue(activity?.config.sessions?.defaultCapacity),
  }
}

export function toClassFormValues(c: ClassData): ClassFormInput {
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

// A custom rule follows the start date; a monthly option that the new date
// doesn't have falls back to its day of the month.
export function withStartDate(
  rule: RecurrenceRule,
  date: string
): RecurrenceRule {
  return {
    ...rule,
    startDate: date,
    monthlyBy:
      rule.monthlyBy && !monthlyOptions(date).includes(rule.monthlyBy)
        ? "day_of_month"
        : rule.monthlyBy,
  }
}
