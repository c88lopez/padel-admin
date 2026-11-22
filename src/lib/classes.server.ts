import { and, asc, count, eq, lt } from "drizzle-orm"
import { db } from "@/db"
import {
  classSeries,
  coachClass,
  coachClassAttendee,
  player,
} from "@/db/schema"
import type { ClassSeries, CoachClass } from "@/db/schema"
import { AppError } from "@/lib/errors"
import {
  assertSpaceBookable,
  assertSpaceFree,
  findSpaceConflicts,
} from "@/lib/spaces.server"
import { assertCoachTeaches } from "@/lib/coaches.server"
import { joinActivity } from "@/lib/players.server"
import { getReservationSettingsRecord } from "@/lib/reservation-settings.server"
import { logger } from "@/lib/logger.server"
import {
  SERIES_HORIZON_MONTHS,
  addDays,
  addMonths,
  occurrences,
} from "@/lib/recurrence"
import type { RecurrenceRule } from "@/lib/recurrence"
import { todayInZone } from "@/lib/tz"

// Data access for classes (no auth). Server-only so the Postgres driver stays
// out of the client bundle; wrapped by classes.functions.ts.

export interface ClassInput {
  coachId: string
  spaceId: string
  date: string
  startTime: string
  durationMinutes: number
  // Omitted: the activity's default (create) or unchanged (update).
  // null: no limit.
  capacity?: number | null
}

export async function createClassRecord(
  clubId: string,
  data: ClassInput
): Promise<CoachClass> {
  // The class is for its space's activity, which its coach must teach.
  const activity = await assertSpaceBookable(clubId, data.spaceId, "sessions")
  await assertCoachTeaches(clubId, data.coachId, activity.id)
  await assertSpaceFree(clubId, data)
  const [created] = await db
    .insert(coachClass)
    .values({
      ...data,
      clubId,
      activityId: activity.id,
      capacity:
        data.capacity === undefined
          ? (activity.config.sessions?.defaultCapacity ?? null)
          : data.capacity,
    })
    .returning()
  return created
}

export async function updateClassRecord(
  clubId: string,
  data: ClassInput & { id: string }
): Promise<CoachClass | undefined> {
  const { id, ...values } = data
  // Moving a class to another activity's space moves it to that activity.
  const activity = await assertSpaceBookable(clubId, values.spaceId, "sessions")
  await assertCoachTeaches(clubId, values.coachId, activity.id)
  await assertSpaceFree(clubId, values, { classId: id })
  return db.transaction(async (tx) => {
    // Locked so a sign-up can't slip in while the capacity is lowered.
    const locked = await lockClass(tx, clubId, id)
    if (!locked) return undefined
    if (typeof values.capacity === "number") {
      const signedUp = await countAttendees(tx, id)
      if (signedUp > values.capacity) {
        throw new AppError("errors.class.capacityBelowAttendees", {
          count: signedUp,
        })
      }
    }
    const [updated] = await tx
      .update(coachClass)
      .set({ ...values, activityId: activity.id })
      .where(eq(coachClass.id, id))
      .returning()
    return updated
  })
}

// Most classes one request creates (a daily series' first year fits).
const MAX_SERIES_CLASSES = 400
// Conflicting dates named in the error before "and n more".
const CONFLICT_DATES_SHOWN = 3

export interface ClassSeriesInput extends Omit<ClassInput, "date"> {
  rule: RecurrenceRule
}

async function clubToday(clubId: string): Promise<string> {
  return todayInZone((await getReservationSettingsRecord(clubId)).timezone)
}

function seriesHorizon(today: string): string {
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
  if (dates.length === 0) throw new AppError("errors.class.seriesEmpty")
  if (dates.length > MAX_SERIES_CLASSES) {
    throw new AppError("errors.class.seriesTooLong", {
      max: MAX_SERIES_CLASSES,
    })
  }
  const conflicts = await findSpaceConflicts(
    clubId,
    fields.spaceId,
    dates,
    fields
  )
  if (conflicts.length > 0) {
    const more = conflicts.length - CONFLICT_DATES_SHOWN
    throw new AppError(
      more > 0
        ? "errors.class.seriesConflictsMore"
        : "errors.class.seriesConflicts",
      {
        dates: conflicts.slice(0, CONFLICT_DATES_SHOWN).join(", "),
        count: more,
        all: conflicts.join(","),
      }
    )
  }
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Locks this club's class row for the rest of the transaction (FOR UPDATE),
// so sign-ups and capacity changes on it run one at a time.
async function lockClass(
  tx: Tx,
  clubId: string,
  classId: string
): Promise<{ capacity: number | null; activityId: string | null } | undefined> {
  const rows = await tx
    .select({
      capacity: coachClass.capacity,
      activityId: coachClass.activityId,
    })
    .from(coachClass)
    .where(and(eq(coachClass.id, classId), eq(coachClass.clubId, clubId)))
    .for("update")
  return rows.at(0)
}

async function countAttendees(tx: Tx, classId: string): Promise<number> {
  const [{ value }] = await tx
    .select({ value: count() })
    .from(coachClassAttendee)
    .where(eq(coachClassAttendee.classId, classId))
  return value
}

export interface AttendeeRecord {
  playerId: string
  fullName: string
  signedUpAt: Date
}

/** The class's attendees, in sign-up order. Empty for another club's class. */
export async function listAttendeeRecords(
  clubId: string,
  classId: string
): Promise<AttendeeRecord[]> {
  return db
    .select({
      playerId: coachClassAttendee.playerId,
      fullName: player.fullName,
      signedUpAt: coachClassAttendee.createdAt,
    })
    .from(coachClassAttendee)
    .innerJoin(coachClass, eq(coachClass.id, coachClassAttendee.classId))
    .innerJoin(player, eq(player.id, coachClassAttendee.playerId))
    .where(
      and(
        eq(coachClassAttendee.classId, classId),
        eq(coachClass.clubId, clubId)
      )
    )
    .orderBy(asc(coachClassAttendee.createdAt))
}

/**
 * Signs a customer up to a class, unless it's full. The class row is locked
 * first, so two sign-ups can't both take the last place. Signing up someone
 * who already attends is a no-op.
 */
export async function addAttendeeRecord(
  clubId: string,
  classId: string,
  playerId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const locked = await lockClass(tx, clubId, classId)
    if (!locked) throw new AppError("errors.class.notFound")
    const customers = await tx
      .select({ id: player.id })
      .from(player)
      .where(and(eq(player.id, playerId), eq(player.clubId, clubId)))
    if (customers.length === 0)
      throw new AppError("errors.class.playerNotFound")
    const existing = await tx
      .select({ playerId: coachClassAttendee.playerId })
      .from(coachClassAttendee)
      .where(
        and(
          eq(coachClassAttendee.classId, classId),
          eq(coachClassAttendee.playerId, playerId)
        )
      )
    if (existing.length > 0) return
    if (
      locked.capacity !== null &&
      (await countAttendees(tx, classId)) >= locked.capacity
    ) {
      throw new AppError("errors.class.full")
    }
    await tx.insert(coachClassAttendee).values({ classId, playerId })
    // Taking a class makes them a customer of its activity (e.g. a student).
    if (locked.activityId) {
      await joinActivity(tx, clubId, playerId, locked.activityId)
    }
  })
}

export async function removeAttendeeRecord(
  clubId: string,
  classId: string,
  playerId: string
): Promise<void> {
  const owned = await db
    .select({ id: coachClass.id })
    .from(coachClass)
    .where(and(eq(coachClass.id, classId), eq(coachClass.clubId, clubId)))
  if (owned.length === 0) return
  await db
    .delete(coachClassAttendee)
    .where(
      and(
        eq(coachClassAttendee.classId, classId),
        eq(coachClassAttendee.playerId, playerId)
      )
    )
}
