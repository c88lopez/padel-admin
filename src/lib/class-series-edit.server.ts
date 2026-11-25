import { count, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import type { Tx } from "@/db"
import { classSeries, coachClass, coachClassAttendee } from "@/db/schema"
import { AppError } from "@/lib/errors"
import { assertSpaceBookable, findSpaceConflicts } from "@/lib/spaces.server"
import { assertCoachTeaches } from "@/lib/coaches.server"
import { addDays, occurrences, sameRecurrence } from "@/lib/recurrence"
import type { RecurrenceRule } from "@/lib/recurrence"
import { planReconcile } from "@/lib/classes"
import { calendarDaysBetween } from "@/lib/tz"
import {
  classWithSeries,
  clubNow,
  updateClassRecord,
} from "@/lib/classes.server"
import type { ClubNow } from "@/lib/classes.server"
import {
  assertSeriesSize,
  endSeries,
  lockSeries,
  scopedClasses,
  seriesClasses,
  seriesConflictsError,
  seriesHorizon,
  seriesRule,
} from "@/lib/class-series.server"

// Deleting and editing classes with a series scope ("this", "following",
// "all"), as Google Calendar does.

// Which classes of a series an edit or delete applies to, as in Calendar.
export type SeriesScope = "this" | "following" | "all"

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
  if (!found)
    throw new AppError("errors.class.notFound", "Esa clase ya no existe.")
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
    throw new AppError(
      "errors.class.capacityBelowAttendees",
      `Ya hay ${most} clientes inscriptos. Pon una capacidad de al menos ${most}, o quita algunos primero.`
    )
  }
}
