import { and, asc, count, eq, gte, inArray, lt, sql } from "drizzle-orm"
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
  sameRecurrence,
} from "@/lib/recurrence"
import type { RecurrenceRule } from "@/lib/recurrence"
import { classEnded, planReconcile } from "@/lib/classes"
import { calendarDaysBetween, nowInZone, todayInZone } from "@/lib/tz"

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

// The series dates on which the space is taken; `all` lists every one, for
// the drawer to resend them as exdates.
function seriesConflictsError(seriesDates: string[]): AppError {
  const more = seriesDates.length - CONFLICT_DATES_SHOWN
  return new AppError(
    more > 0
      ? "errors.class.seriesConflictsMore"
      : "errors.class.seriesConflicts",
    {
      dates: seriesDates.slice(0, CONFLICT_DATES_SHOWN).join(", "),
      count: more,
      all: seriesDates.join(","),
    }
  )
}

function assertSeriesSize(dates: string[]): void {
  if (dates.length === 0) throw new AppError("errors.class.seriesEmpty")
  if (dates.length > MAX_SERIES_CLASSES) {
    throw new AppError("errors.class.seriesTooLong", {
      max: MAX_SERIES_CLASSES,
    })
  }
}

export interface ClassSeriesInput extends Omit<ClassInput, "date"> {
  rule: RecurrenceRule
}

async function clubToday(clubId: string): Promise<string> {
  return todayInZone((await getReservationSettingsRecord(clubId)).timezone)
}

// The club's wall clock, which decides which classes have ended.
async function clubNow(clubId: string): Promise<ClubNow> {
  return nowInZone((await getReservationSettingsRecord(clubId)).timezone)
}

export interface ClubNow {
  date: string
  time: string
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

// Which classes of a series an edit or delete applies to, as in Calendar.
export type SeriesScope = "this" | "following" | "all"

// The class and its series (null for a one-off class), in this club.
async function classWithSeries(clubId: string, classId: string) {
  const rows = await db
    .select({ cls: coachClass, series: classSeries })
    .from(coachClass)
    .leftJoin(classSeries, eq(classSeries.id, coachClass.seriesId))
    .where(and(eq(coachClass.id, classId), eq(coachClass.clubId, clubId)))
  return rows.at(0)
}

type SeriesClass = CoachClass & { seriesDate: string; attendeeCount: number }

async function seriesClasses(seriesId: string): Promise<SeriesClass[]> {
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
function scopedClasses(
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

async function lockSeries(tx: Tx, seriesId: string): Promise<ClassSeries> {
  const rows = await tx
    .select()
    .from(classSeries)
    .where(eq(classSeries.id, seriesId))
    .for("update")
  const series = rows.at(0)
  if (!series) throw new AppError("errors.class.notFound")
  return series
}

// Ends a series after `until`, or deletes it when it keeps no class.
async function endSeries(
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

/**
 * Deletes a class, or with a scope its series' later classes too:
 * - this: the class; its series date becomes an exdate so filling ahead
 *   doesn't bring it back.
 * - following: this and later classes; the series ends the day before.
 * - all: every class that hasn't ended; ended ones stay as history.
 * Attendees go with their classes.
 */
export async function deleteClassRecord(
  clubId: string,
  classId: string,
  scope: SeriesScope = "this",
  now?: ClubNow
): Promise<void> {
  const found = await classWithSeries(clubId, classId)
  if (!found) return
  const { cls, series } = found
  if (!series || !cls.seriesDate || scope === "this") {
    await db.transaction(async (tx) => {
      await tx.delete(coachClass).where(eq(coachClass.id, cls.id))
      if (!series || !cls.seriesDate) return
      const locked = await lockSeries(tx, series.id)
      await tx
        .update(classSeries)
        .set({ exdates: [...new Set([...locked.exdates, cls.seriesDate])] })
        .where(eq(classSeries.id, series.id))
    })
    return
  }
  const classes = await seriesClasses(series.id)
  const target = scopedClasses(
    classes,
    { ...cls, seriesDate: cls.seriesDate, attendeeCount: 0 },
    scope,
    now ?? (await clubNow(clubId))
  )
  const removed = new Set(target.map((c) => c.id))
  const kept = classes.filter((c) => !removed.has(c.id))
  await db.transaction(async (tx) => {
    await lockSeries(tx, series.id)
    if (removed.size > 0) {
      await tx.delete(coachClass).where(inArray(coachClass.id, [...removed]))
    }
    // Ends after the last class it keeps; one that keeps none is gone.
    await endSeries(
      tx,
      series.id,
      kept.length === 0
        ? null
        : scope === "following"
          ? addDays(cls.seriesDate as string, -1)
          : (kept.at(-1)?.seriesDate ?? null)
    )
  })
}

export interface ClassSeriesEdit {
  id: string
  scope: "following" | "all"
  coachId: string
  spaceId: string
  // The edited class's date; moving it moves the series by as many days.
  date: string
  startTime: string
  durationMinutes: number
  capacity: number | null
  // The rule from the drawer. Its start is worked out here, from the scope.
  rule: RecurrenceRule
  // Classes the new rule drops are only removed once the admin confirmed.
  confirmed: boolean
}

export type SeriesEditResult =
  | { saved: true }
  | { saved: false; removedClasses: number; removedSignUps: number }

/**
 * Edits "this and following" or "all" classes of a series, as Calendar does.
 * With the same rule and days, the fields change in place on every class in
 * scope (attendees stay). Otherwise the series is split where the scope
 * starts (unless that's its first class): the old one ends the day before,
 * and the classes in scope are reconciled with the new rule. Classes it drops
 * are only removed once `confirmed`; until then their count is returned.
 */
export async function updateClassSeriesRecord(
  clubId: string,
  data: ClassSeriesEdit,
  now?: ClubNow
): Promise<SeriesEditResult> {
  const found = await classWithSeries(clubId, data.id)
  if (!found) throw new AppError("errors.class.notFound")
  const { cls, series } = found
  const fields = {
    coachId: data.coachId,
    spaceId: data.spaceId,
    startTime: data.startTime,
    durationMinutes: data.durationMinutes,
    capacity: data.capacity,
  }
  if (!series || !cls.seriesDate) {
    await updateClassRecord(clubId, { ...fields, id: cls.id, date: data.date })
    return { saved: true }
  }
  const activity = await assertSpaceBookable(clubId, fields.spaceId, "sessions")
  await assertCoachTeaches(clubId, fields.coachId, activity.id)
  const clock = now ?? (await clubNow(clubId))
  const classes = await seriesClasses(series.id)
  const scoped = scopedClasses(
    classes,
    { ...cls, seriesDate: cls.seriesDate, attendeeCount: 0 },
    data.scope,
    clock
  )
  const from = scoped.at(0)?.seriesDate
  if (!from) return { saved: true }
  const shift = calendarDaysBetween(cls.seriesDate, data.date)
  const start = addDays(from, shift)
  const rule: RecurrenceRule = {
    ...data.rule,
    startDate: start,
    exdates: [
      ...new Set([
        ...series.exdates.filter((d) => d >= start),
        ...data.rule.exdates,
      ]),
    ],
  }
  const newExdates = data.rule.exdates.some((d) => !series.exdates.includes(d))
  const values = { ...fields, activityId: activity.id }

  if (shift === 0 && !newExdates && sameRecurrence(rule, seriesRule(series))) {
    const conflicts = await findSpaceConflicts(
      clubId,
      fields.spaceId,
      scoped.map((c) => c.date),
      fields,
      { seriesId: series.id }
    )
    if (conflicts.length > 0) {
      const byDate = new Map(scoped.map((c) => [c.date, c.seriesDate]))
      throw seriesConflictsError(conflicts.map((d) => byDate.get(d) ?? d))
    }
    const ids = scoped.map((c) => c.id)
    await db.transaction(async (tx) => {
      await lockSeries(tx, series.id)
      await assertCapacityFits(tx, ids, fields.capacity)
      await tx.update(coachClass).set(values).where(inArray(coachClass.id, ids))
      await tx
        .update(classSeries)
        .set(values)
        .where(eq(classSeries.id, series.id))
    })
    return { saved: true }
  }

  const horizon = seriesHorizon(clock.date)
  const newDates = occurrences(rule, start, horizon)
  assertSeriesSize(newDates)
  const plan = planReconcile(scoped, newDates, shift)
  if (plan.remove.length > 0 && !data.confirmed) {
    return {
      saved: false,
      removedClasses: plan.remove.length,
      removedSignUps: plan.remove.reduce((n, c) => n + c.attendeeCount, 0),
    }
  }
  const seriesDateOf = new Map([
    ...plan.keep.map((k) => [k.date, k.seriesDate] as const),
    ...plan.add.map((d) => [d, d] as const),
  ])
  const conflicts = await findSpaceConflicts(
    clubId,
    fields.spaceId,
    [...seriesDateOf.keys()],
    fields,
    { seriesId: series.id }
  )
  if (conflicts.length > 0) {
    throw seriesConflictsError(conflicts.map((d) => seriesDateOf.get(d) ?? d))
  }
  // Split unless the scope starts at the series' first class.
  const split = classes.some((c) => c.seriesDate < from)
  const ruleValues = {
    frequency: rule.frequency,
    interval: rule.interval,
    weekdays: rule.weekdays,
    monthlyBy: rule.monthlyBy,
    startDate: rule.startDate,
    until: rule.until,
    count: rule.count,
    exdates: rule.exdates,
    generatedUntil: horizon,
  }
  await db.transaction(async (tx) => {
    await lockSeries(tx, series.id)
    await assertCapacityFits(
      tx,
      plan.keep.map((k) => k.id),
      fields.capacity
    )
    let targetId = series.id
    if (split) {
      await endSeries(tx, series.id, addDays(from, -1))
      const [created] = await tx
        .insert(classSeries)
        .values({ ...values, ...ruleValues, clubId })
        .returning()
      targetId = created.id
    } else {
      await tx
        .update(classSeries)
        .set({ ...values, ...ruleValues })
        .where(eq(classSeries.id, series.id))
    }
    if (plan.remove.length > 0) {
      await tx.delete(coachClass).where(
        inArray(
          coachClass.id,
          plan.remove.map((c) => c.id)
        )
      )
    }
    if (plan.keep.length > 0) {
      // Cleared first: moving every class a week on would otherwise collide
      // with the next one's series date (unique per series) mid-update.
      await tx
        .update(coachClass)
        .set({ seriesDate: null })
        .where(
          inArray(
            coachClass.id,
            plan.keep.map((k) => k.id)
          )
        )
      for (const k of plan.keep) {
        await tx
          .update(coachClass)
          .set({
            ...values,
            seriesId: targetId,
            seriesDate: k.seriesDate,
            date: k.date,
          })
          .where(eq(coachClass.id, k.id))
      }
    }
    if (plan.add.length > 0) {
      await tx.insert(coachClass).values(
        plan.add.map((date) => ({
          ...values,
          clubId,
          date,
          seriesId: targetId,
          seriesDate: date,
        }))
      )
    }
  })
  return { saved: true }
}

// Locks the classes and refuses a capacity below any one's sign-ups.
async function assertCapacityFits(
  tx: Tx,
  classIds: string[],
  capacity: number | null
): Promise<void> {
  if (classIds.length === 0) return
  await tx
    .select({ id: coachClass.id })
    .from(coachClass)
    .where(inArray(coachClass.id, classIds))
    .for("update")
  if (capacity === null) return
  const counts = await tx
    .select({ n: count() })
    .from(coachClassAttendee)
    .where(inArray(coachClassAttendee.classId, classIds))
    .groupBy(coachClassAttendee.classId)
  const most = Math.max(0, ...counts.map((c) => c.n))
  if (most > capacity) {
    throw new AppError("errors.class.capacityBelowAttendees", { count: most })
  }
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

// The series classes from this one on (or just it, for a one-off class).
async function thisAndFollowing(
  clubId: string,
  classId: string
): Promise<CoachClass[]> {
  const found = await classWithSeries(clubId, classId)
  if (!found) throw new AppError("errors.class.notFound")
  const { cls } = found
  if (!cls.seriesId || !cls.seriesDate) return [cls]
  return db
    .select()
    .from(coachClass)
    .where(
      and(
        eq(coachClass.seriesId, cls.seriesId),
        eq(coachClass.clubId, clubId),
        gte(coachClass.seriesDate, cls.seriesDate)
      )
    )
    .orderBy(asc(coachClass.date))
}

/**
 * Signs a customer up to this class and every later class of its series,
 * each with addAttendeeRecord's lock and capacity check. Full classes are
 * skipped and their dates returned, so one full date doesn't stop the rest.
 */
export async function addSeriesAttendeeRecord(
  clubId: string,
  classId: string,
  playerId: string
): Promise<{ classes: number; full: string[] }> {
  const classes = await thisAndFollowing(clubId, classId)
  const full: string[] = []
  for (const c of classes) {
    try {
      await addAttendeeRecord(clubId, c.id, playerId)
    } catch (err) {
      if (err instanceof AppError && err.code === "errors.class.full") {
        full.push(c.date)
        continue
      }
      throw err
    }
  }
  return { classes: classes.length - full.length, full }
}

/** Takes a customer off this class and every later class of its series. */
export async function removeSeriesAttendeeRecord(
  clubId: string,
  classId: string,
  playerId: string
): Promise<void> {
  const classes = await thisAndFollowing(clubId, classId)
  await db.delete(coachClassAttendee).where(
    and(
      inArray(
        coachClassAttendee.classId,
        classes.map((c) => c.id)
      ),
      eq(coachClassAttendee.playerId, playerId)
    )
  )
}
