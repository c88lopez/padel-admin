import { and, asc, eq, gte, inArray } from "drizzle-orm"
import { db } from "@/db"
import { coachClass, coachClassAttendee, player } from "@/db/schema"
import type { CoachClass } from "@/db/schema"
import { AppError } from "@/lib/errors"
import { joinActivity } from "@/lib/players.server"
import {
  classWithSeries,
  countAttendees,
  lockClass,
} from "@/lib/classes.server"

// Class sign-ups: one class, or a class and the rest of its series.

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
    await tx.insert(coachClassAttendee).values({ classId, playerId, clubId })
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
