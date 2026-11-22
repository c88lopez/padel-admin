import { timeToMin } from "@/lib/reservation-overlap"
import { addDays } from "@/lib/recurrence"
import { calendarDaysBetween } from "@/lib/tz"

export type ClassStatus = "Upcoming" | "Ongoing" | "Completed"

/**
 * Derives a class's status from its scheduled date/time and duration relative to
 * `now`. Deriving (rather than storing) keeps the status accurate over time
 * without a background job.
 *
 * - before the start    → "Upcoming"
 * - within the session   → "Ongoing"
 * - after it ends        → "Completed"
 */
export function classStatus(
  date: string, // "YYYY-MM-DD"
  startTime: string, // "HH:MM"
  durationMinutes: number,
  now: Date = new Date()
): ClassStatus {
  const start = new Date(`${date}T${startTime}:00`)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  if (now < start) return "Upcoming"
  if (now < end) return "Ongoing"
  return "Completed"
}

/** Formats a duration in minutes as "<n> min" for display. */
export function formatDuration(durationMinutes: number): string {
  return `${durationMinutes} min`
}

/** Converts "HH:MM" + duration into an end-time "HH:MM" (same-day). */
export function endTime(startTime: string, durationMinutes: number): string {
  const total = timeToMin(startTime) + durationMinutes
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * True once the class is over at `now` (the club's wall clock), also for a
 * class that runs past midnight.
 */
export function classEnded(
  date: string,
  startTime: string,
  durationMinutes: number,
  now: { date: string; time: string }
): boolean {
  const end =
    calendarDaysBetween(now.date, date) * 1440 +
    timeToMin(startTime) +
    durationMinutes
  return end <= timeToMin(now.time)
}

export interface SeriesClassRef {
  id: string
  seriesDate: string
  date: string
  attendeeCount: number
}

export interface ReconcilePlan {
  // Classes that stay, with the series date and date they move to.
  keep: { id: string; seriesDate: string; date: string }[]
  remove: SeriesClassRef[]
  // Rule dates that get a new class.
  add: string[]
}

/**
 * Matches a series' classes to its new rule's dates. Each class is shifted by
 * `shiftDays` (the series moved to other days); one that lands on a rule date
 * keeps its attendees, the rest are removed, and uncovered dates get new
 * classes. A class moved on its own keeps its offset from its series date.
 */
export function planReconcile(
  classes: SeriesClassRef[],
  newDates: string[],
  shiftDays: number
): ReconcilePlan {
  const open = new Set(newDates)
  const keep: ReconcilePlan["keep"] = []
  const remove: SeriesClassRef[] = []
  for (const c of classes) {
    const seriesDate = addDays(c.seriesDate, shiftDays)
    if (open.delete(seriesDate)) {
      keep.push({ id: c.id, seriesDate, date: addDays(c.date, shiftDays) })
    } else {
      remove.push(c)
    }
  }
  return { keep, remove, add: newDates.filter((d) => open.has(d)) }
}
