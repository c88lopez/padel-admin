import { and, asc, eq, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import type { Tx } from "@/db"
import { classSeries, coachClass, coachClassAttendee } from "@/db/schema"
import type { ClassSeries, CoachClass } from "@/db/schema"
import { AppError } from "@/lib/errors"
import { assertSpaceBookable, findSpaceConflicts } from "@/lib/spaces.server"
import { assertCoachTeaches } from "@/lib/coaches.server"
import { logger } from "@/lib/logger.server"
import {
  SERIES_HORIZON_MONTHS,
  addDays,
  addMonths,
  occurrences,
} from "@/lib/recurrence"
import type { RecurrenceRule } from "@/lib/recurrence"
import { classEnded } from "@/lib/classes"
import { clubToday } from "@/lib/classes.server"
import type { ClassInput, ClubNow } from "@/lib/classes.server"

// Data access for recurring classes: creating a series, filling it ahead, and
// the series helpers its edits share (class-series-edit.server.ts).

// Most classes one request creates (a daily series' first year fits).
const MAX_SERIES_CLASSES = 400
// Conflicting dates named in the error before "and n more".
const CONFLICT_DATES_SHOWN = 3

// The series dates on which the space is taken; `all` lists every one, for
// the drawer to resend them as exdates.
export function seriesConflictsError(seriesDates: string[]): AppError {
  const more = seriesDates.length - CONFLICT_DATES_SHOWN
  const dates = seriesDates.slice(0, CONFLICT_DATES_SHOWN).join(", ")
  const all = seriesDates.join(",")
  if (more > 0) {
    return new AppError(
      "errors.class.seriesConflictsMore",
      `El espacio está ocupado a esa hora el ${dates} y ${more} fechas más. Omite esas fechas, o elige otra hora u otro espacio.`,
      { dates, count: more, all }
    )
  }
  return new AppError(
    "errors.class.seriesConflicts",
    `El espacio está ocupado a esa hora el ${dates}. Omite esas fechas, o elige otra hora u otro espacio.`,
    { dates, all }
  )
}

export function assertSeriesSize(dates: string[]): void {
  if (dates.length === 0)
    throw new AppError(
      "errors.class.seriesEmpty",
      "Esta repetición no da ninguna fecha en los próximos 12 meses. Cambia el inicio o el final."
    )
  if (dates.length > MAX_SERIES_CLASSES) {
    throw new AppError(
      "errors.class.seriesTooLong",
      `Son más de ${MAX_SERIES_CLASSES} clases de una vez. Elige una serie más corta.`
    )
  }
}

export interface ClassSeriesInput extends Omit<ClassInput, "date"> {
  rule: RecurrenceRule
}

export function seriesHorizon(today: string): string {
  return addMonths(today, SERIES_HORIZON_MONTHS)
}

export function seriesRule(row: ClassSeries): RecurrenceRule {
  return {
    frequency: row.frequency,
    interval: row.interval,
    weekdays: row.weekdays,
    monthlyBy: row.monthlyBy,
    startDate: row.startDate,
    until: row.until,
    count: row.count,
    exdates: row.exdates,
  }
}

/**
 * Creates a recurring class: the series and its classes up to 12 months
 * ahead, in one transaction. Refuses it when the space is taken on any of its
 * dates, naming them (`all` lists every one, for the drawer to resend them as
 * exdates).
 */
export async function createClassSeriesRecord(
  clubId: string,
  data: ClassSeriesInput,
  today?: string
): Promise<ClassSeries> {
  const { rule, ...fields } = data
  const activity = await assertSpaceBookable(clubId, fields.spaceId, "sessions")
  await assertCoachTeaches(clubId, fields.coachId, activity.id)
  const generatedUntil = seriesHorizon(today ?? (await clubToday(clubId)))
  const dates = occurrences(rule, rule.startDate, generatedUntil)
  assertSeriesSize(dates)
  const conflicts = await findSpaceConflicts(
    clubId,
    fields.spaceId,
    dates,
    fields
  )
  if (conflicts.length > 0) throw seriesConflictsError(conflicts)
  const capacity =
    fields.capacity === undefined
      ? (activity.config.sessions?.defaultCapacity ?? null)
      : fields.capacity
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(classSeries)
      .values({
        ...fields,
        ...rule,
        capacity,
        clubId,
        activityId: activity.id,
        generatedUntil,
      })
      .returning()
    await tx.insert(coachClass).values(
      dates.map((date) => ({
        ...fields,
        capacity,
        date,
        clubId,
        activityId: activity.id,
        seriesId: created.id,
        seriesDate: date,
      }))
    )
    return created
  })
}

/**
 * Tops up the club's series with classes up to 12 months ahead, so series
 * that never end keep going. Runs lazily when classes are listed. A date
 * whose space is now taken is skipped and kept in the series' exdates.
 */
export async function fillSeriesAhead(
  clubId: string,
  today?: string
): Promise<void> {
  const horizon = seriesHorizon(today ?? (await clubToday(clubId)))
  const due = await db
    .select({ id: classSeries.id })
    .from(classSeries)
    .where(
      and(
        eq(classSeries.clubId, clubId),
        lt(classSeries.generatedUntil, horizon)
      )
    )
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      // Locked so concurrent page loads fill each series once.
      const rows = await tx
        .select()
        .from(classSeries)
        .where(eq(classSeries.id, id))
        .for("update")
      const series = rows.at(0)
      if (!series || series.generatedUntil >= horizon) return
      const dates = occurrences(
        seriesRule(series),
        addDays(series.generatedUntil, 1),
        horizon
      )
      const skipped = await findSpaceConflicts(
        clubId,
        series.spaceId,
        dates,
        series
      )
      const created = dates.filter((date) => !skipped.includes(date))
      if (created.length > 0) {
        await tx
          .insert(coachClass)
          .values(
            created.map((date) => ({
              coachId: series.coachId,
              spaceId: series.spaceId,
              activityId: series.activityId,
              startTime: series.startTime,
              durationMinutes: series.durationMinutes,
              capacity: series.capacity,
              date,
              clubId,
              seriesId: series.id,
              seriesDate: date,
            }))
          )
          .onConflictDoNothing()
      }
      if (skipped.length > 0) {
        logger.warn(
          { clubId, seriesId: series.id, dates: skipped },
          "class series dates skipped: space taken"
        )
      }
      await tx
        .update(classSeries)
        .set({
          generatedUntil: horizon,
          exdates: [...series.exdates, ...skipped],
        })
        .where(eq(classSeries.id, series.id))
    })
  }
}

export type SeriesClass = CoachClass & {
  seriesDate: string
  attendeeCount: number
}

export async function seriesClasses(seriesId: string): Promise<SeriesClass[]> {
  const rows = await db
    .select({
      cls: coachClass,
      attendeeCount: sql<number>`(
        select count(*)::int from ${coachClassAttendee}
        where ${coachClassAttendee.classId} = ${coachClass.id}
      )`,
    })
    .from(coachClass)
    .where(eq(coachClass.seriesId, seriesId))
    .orderBy(asc(coachClass.seriesDate))
  return rows.flatMap(({ cls, attendeeCount }) =>
    cls.seriesDate
      ? [{ ...cls, seriesDate: cls.seriesDate, attendeeCount }]
      : []
  )
}

// The classes a scope covers: this one and every later one, or for "all"
// every class that hasn't ended (ended ones are history and stay as they
// were).
export function scopedClasses(
  classes: SeriesClass[],
  cls: SeriesClass,
  scope: "following" | "all",
  now: ClubNow
): SeriesClass[] {
  return scope === "following"
    ? classes.filter((c) => c.seriesDate >= cls.seriesDate)
    : classes.filter(
        (c) => !classEnded(c.date, c.startTime, c.durationMinutes, now)
      )
}

export async function lockSeries(
  tx: Tx,
  seriesId: string
): Promise<ClassSeries> {
  const rows = await tx
    .select()
    .from(classSeries)
    .where(eq(classSeries.id, seriesId))
    .for("update")
  const series = rows.at(0)
  if (!series)
    throw new AppError("errors.class.notFound", "Esa clase ya no existe.")
  return series
}

// Ends a series after `until`, or deletes it when it keeps no class.
export async function endSeries(
  tx: Tx,
  seriesId: string,
  until: string | null
): Promise<void> {
  if (until === null) {
    await tx.delete(classSeries).where(eq(classSeries.id, seriesId))
    return
  }
  await tx
    .update(classSeries)
    .set({ until, count: null })
    .where(eq(classSeries.id, seriesId))
}
