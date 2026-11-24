import { useCallback, useMemo, useState } from "react"
import { format } from "date-fns"
import {
  presetRules,
  sameRecurrence,
  seriesPreview,
  shiftWeekdays,
} from "@/lib/recurrence"
import type { PresetId, RecurrenceRule } from "@/lib/recurrence"
import { calendarDaysBetween } from "@/lib/tz"
import { withStartDate } from "@/lib/class-form"
import type { ClassData } from "@/lib/class-form"

// The Repeat select's value: a preset, or the rule from Custom….
export type Repeat = PresetId | "custom"
export const CUSTOMIZE = "customize"

export type ClassRecurrence = ReturnType<typeof useClassRecurrence>

/**
 * The class drawer's repeat rule: the chosen preset or custom rule for the
 * picked start date, plus the dates the space is taken on (from the last
 * refused series) and the ones the admin chose to skip.
 */
export function useClassRecurrence(
  coachClass: ClassData | undefined,
  startDate: string | null
) {
  const isEditing = !!coachClass
  const series = coachClass?.series ?? null
  const [repeat, setRepeat] = useState<Repeat>("none")
  const [customRule, setCustomRule] = useState<RecurrenceRule | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  // The series' own rule, until Custom… replaces it: it moves with the date.
  const [customFromSeries, setCustomFromSeries] = useState(false)
  const [conflicts, setConflicts] = useState<string[]>([])
  const [skipped, setSkipped] = useState<string[]>([])

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

  // Back to the class's own series (or no repeat), as the drawer opens.
  const reset = useCallback(() => {
    setRepeat(series ? "custom" : "none")
    setCustomRule(series?.rule ?? null)
    setCustomFromSeries(!!series)
    setConflicts([])
    setSkipped([])
  }, [series])

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

  function saveCustom(saved: RecurrenceRule) {
    setCustomRule(saved)
    setCustomFromSeries(false)
    setRepeat("custom")
    setConflicts([])
  }

  // Skips the conflicting dates from now on; returns the rule without them.
  function skipConflicts(): RecurrenceRule | null {
    if (!rule) return null
    const next = [...skipped, ...conflicts]
    setSkipped(next)
    return { ...rule, exdates: [...new Set([...rule.exdates, ...next])] }
  }

  return {
    series,
    repeat,
    presets,
    customForDate,
    rule,
    preview,
    repeatChanged,
    customOpen,
    setCustomOpen,
    conflicts,
    setConflicts,
    reset,
    changeRepeat,
    saveCustom,
    skipConflicts,
  }
}
