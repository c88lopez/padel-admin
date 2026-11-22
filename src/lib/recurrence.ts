import type { TFunction } from "i18next"

// Recurrence rules for class series, modelled on Google Calendar's options.
// Dates are plain "YYYY-MM-DD" strings, computed on UTC day numbers, so there
// are no time zones and no DST bugs.

export type Frequency = "daily" | "weekly" | "monthly" | "yearly"

// Monthly rules take the day or the weekday ordinal from `startDate`, as in
// Calendar: "on day 18", "on the third Tuesday", "on the last Tuesday".
export type MonthlyBy =
  | "day_of_month"
  | "weekday_of_month"
  | "last_weekday_of_month"

// ISO weekday: 1 = Monday … 7 = Sunday.
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface RecurrenceRule {
  frequency: Frequency
  interval: number
  // Weekly only; an empty list means the start date's weekday.
  weekdays: Weekday[]
  // Monthly only; null means "day_of_month".
  monthlyBy: MonthlyBy | null
  // The rule's dates start here, but only dates matching the rule count (a
  // weekly Mon/Wed rule starting on a Tuesday first falls on the Wednesday).
  startDate: string
  // At most one of these; both null = never ends.
  until: string | null
  count: number | null
  // Rule dates that get no occurrence. They still count towards `count`.
  exdates: string[]
}

const DAY_MS = 86_400_000

function toDayNum(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

function fromDayNum(dayNum: number): string {
  return new Date(dayNum * DAY_MS).toISOString().slice(0, 10)
}

function fromParts(year: number, month: number, day: number): string {
  return fromDayNum(Date.UTC(year, month - 1, day) / DAY_MS)
}

function parts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number)
  return { year, month, day }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** ISO weekday of a date (1 = Monday … 7 = Sunday). */
export function isoWeekday(date: string): Weekday {
  // Day 0 (1970-01-01) was a Thursday.
  return (((((toDayNum(date) + 3) % 7) + 7) % 7) + 1) as Weekday
}

/** Which occurrence of its weekday in the month the date is (1–5). */
export function weekdayOrdinal(date: string): number {
  return Math.ceil(parts(date).day / 7)
}

/** True when no later day of the month has the same weekday. */
export function isLastWeekdayOfMonth(date: string): boolean {
  const { year, month, day } = parts(date)
  return day + 7 > daysInMonth(year, month)
}

function shiftMonth(year: number, month: number, n: number) {
  const index = year * 12 + (month - 1) + n
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** The date `n` days later (earlier when negative). */
export function addDays(date: string, n: number): string {
  return fromDayNum(toDayNum(date) + n)
}

/** The same day `n` months later, or that month's last day if it's shorter. */
export function addMonths(date: string, n: number): string {
  const { year, month, day } = parts(date)
  const m = shiftMonth(year, month, n)
  return fromParts(m.year, m.month, Math.min(day, daysInMonth(m.year, m.month)))
}

// The day of the month that has the given weekday ordinal (0 when the month
// has no fifth one).
function nthWeekdayDay(
  year: number,
  month: number,
  weekday: Weekday,
  ordinal: number | "last"
): number {
  const length = daysInMonth(year, month)
  if (ordinal === "last") {
    const lastWeekday = isoWeekday(fromParts(year, month, length))
    return length - ((lastWeekday - weekday + 7) % 7)
  }
  const firstWeekday = isoWeekday(fromParts(year, month, 1))
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (ordinal - 1) * 7
  return day <= length ? day : 0
}

// Every date the rule falls on, ascending, ignoring the end and the exdates.
function* ruleDates(rule: RecurrenceRule): Generator<string> {
  const interval = Math.max(1, Math.floor(rule.interval))
  const start = toDayNum(rule.startDate)
  const { year, month, day } = parts(rule.startDate)

  switch (rule.frequency) {
    case "daily":
      for (let n = start; ; n += interval) yield fromDayNum(n)

    case "weekly": {
      const weekdays = rule.weekdays.length
        ? [...new Set(rule.weekdays)].sort((a, b) => a - b)
        : [isoWeekday(rule.startDate)]
      const monday = start - (isoWeekday(rule.startDate) - 1)
      for (let week = monday; ; week += 7 * interval) {
        for (const weekday of weekdays) {
          const n = week + weekday - 1
          if (n >= start) yield fromDayNum(n)
        }
      }
    }

    case "monthly": {
      const by = rule.monthlyBy ?? "day_of_month"
      const weekday = isoWeekday(rule.startDate)
      const ordinal = weekdayOrdinal(rule.startDate)
      for (let i = 0; ; i += interval) {
        const m = shiftMonth(year, month, i)
        const d =
          by === "day_of_month"
            ? day <= daysInMonth(m.year, m.month)
              ? day
              : 0
            : nthWeekdayDay(
                m.year,
                m.month,
                weekday,
                by === "last_weekday_of_month" ? "last" : ordinal
              )
        if (d === 0) continue
        const date = fromParts(m.year, m.month, d)
        if (toDayNum(date) >= start) yield date
      }
    }

    case "yearly":
      for (let y = year; ; y += interval) {
        if (day <= daysInMonth(y, month)) yield fromParts(y, month, day)
      }
  }
}

/**
 * The rule's occurrence dates between `from` and `to` (inclusive), without its
 * exdates. As in RRULE, `count` counts from the start, exdates included.
 */
export function occurrences(
  rule: RecurrenceRule,
  from: string,
  to: string
): string[] {
  const exdates = new Set(rule.exdates)
  const result: string[] = []
  let produced = 0
  for (const date of ruleDates(rule)) {
    if (date > to) break
    if (rule.until !== null && date > rule.until) break
    if (rule.count !== null && produced >= rule.count) break
    produced++
    if (date >= from && !exdates.has(date)) result.push(date)
  }
  return result
}

/** The monthly options Calendar offers for a start date. */
export function monthlyOptions(date: string): MonthlyBy[] {
  const options: MonthlyBy[] = ["day_of_month"]
  if (weekdayOrdinal(date) <= 4) options.push("weekday_of_month")
  if (isLastWeekdayOfMonth(date)) options.push("last_weekday_of_month")
  return options
}

export type PresetId =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "weekdays"

export interface RecurrencePreset {
  id: PresetId
  rule: RecurrenceRule | null
}

/** The Repeat select's options for a start date (Custom… aside). */
export function presetRules(date: string): RecurrencePreset[] {
  const base = {
    interval: 1,
    weekdays: [],
    monthlyBy: null,
    startDate: date,
    until: null,
    count: null,
    exdates: [],
  } satisfies Omit<RecurrenceRule, "frequency">
  return [
    { id: "none", rule: null },
    { id: "daily", rule: { ...base, frequency: "daily" } },
    {
      id: "weekly",
      rule: { ...base, frequency: "weekly", weekdays: [isoWeekday(date)] },
    },
    {
      id: "monthly",
      rule: {
        ...base,
        frequency: "monthly",
        // A fifth weekday is always the month's last one.
        monthlyBy:
          weekdayOrdinal(date) <= 4
            ? "weekday_of_month"
            : "last_weekday_of_month",
      },
    },
    { id: "yearly", rule: { ...base, frequency: "yearly" } },
    {
      id: "weekdays",
      rule: { ...base, frequency: "weekly", weekdays: [1, 2, 3, 4, 5] },
    },
  ]
}

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const
const ORDINAL_KEYS = ["first", "second", "third", "fourth", "fifth"] as const

function weekdayName(weekday: Weekday, t: TFunction): string {
  return t(`recurrence.weekdays.${WEEKDAY_KEYS[weekday - 1]}`)
}

function monthName(month: number, t: TFunction): string {
  return t(`recurrence.months.${MONTH_KEYS[month - 1]}`)
}

function isWorkweek(weekdays: Weekday[]): boolean {
  const set = new Set(weekdays)
  return set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d as Weekday))
}

function describeFrequency(rule: RecurrenceRule, t: TFunction): string {
  const count = Math.max(1, Math.floor(rule.interval))
  const every = count > 1
  const { month, day } = parts(rule.startDate)

  switch (rule.frequency) {
    case "daily":
      return every
        ? t("recurrence.everyNDays", { count })
        : t("recurrence.daily")

    case "weekly": {
      const weekdays = rule.weekdays.length
        ? [...new Set(rule.weekdays)].sort((a, b) => a - b)
        : [isoWeekday(rule.startDate)]
      if (!every && isWorkweek(weekdays)) return t("recurrence.everyWeekday")
      const days =
        weekdays.length === 1
          ? weekdayName(weekdays[0], t)
          : weekdays
              .map((d) => t(`recurrence.weekdaysShort.${WEEKDAY_KEYS[d - 1]}`))
              .join(", ")
      return every
        ? t("recurrence.everyNWeeksOn", { count, days })
        : t("recurrence.weeklyOn", { days })
    }

    case "monthly": {
      const by = rule.monthlyBy ?? "day_of_month"
      const on =
        by === "day_of_month"
          ? t("recurrence.onDay", { day })
          : t("recurrence.onWeekdayOfMonth", {
              ordinal: t(
                `recurrence.ordinals.${
                  by === "last_weekday_of_month"
                    ? "last"
                    : ORDINAL_KEYS[weekdayOrdinal(rule.startDate) - 1]
                }`
              ),
              weekday: weekdayName(isoWeekday(rule.startDate), t),
            })
      return every
        ? t("recurrence.everyNMonthsOn", { count, on })
        : t("recurrence.monthlyOn", { on })
    }

    case "yearly": {
      const date = t("recurrence.dayMonth", {
        day,
        month: monthName(month, t),
      })
      return every
        ? t("recurrence.everyNYearsOn", { count, date })
        : t("recurrence.annuallyOn", { date })
    }
  }
}

/**
 * The rule as a sentence in the current language: "Weekly on Tuesday",
 * "Every 2 weeks on Mon, Wed, 10 times", "Monthly on the last Friday, until
 * 30 June 2027".
 */
export function describeRule(rule: RecurrenceRule, t: TFunction): string {
  const frequency = describeFrequency(rule, t)
  if (rule.count !== null)
    return t("recurrence.withEnd", {
      rule: frequency,
      end: t("recurrence.times", { count: rule.count }),
    })
  if (rule.until !== null) {
    const { year, month, day } = parts(rule.until)
    return t("recurrence.withEnd", {
      rule: frequency,
      end: t("recurrence.until", {
        date: t("recurrence.fullDate", {
          day,
          month: monthName(month, t),
          year,
        }),
      }),
    })
  }
  return frequency
}

/** The Repeat select's label for a preset. */
export function presetLabel(preset: RecurrencePreset, t: TFunction): string {
  if (!preset.rule) return t("recurrence.doesNotRepeat")
  if (preset.id === "weekdays") return t("recurrence.everyWeekdayMonToFri")
  return describeRule(preset.rule, t)
}
