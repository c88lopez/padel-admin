import { and, asc, count, eq } from "drizzle-orm"
import { db } from "@/db"
import { coachClass, coachClassAttendee, player } from "@/db/schema"
import type { CoachClass } from "@/db/schema"
import { AppError } from "@/lib/errors"
import { assertSpaceBookable, assertSpaceFree } from "@/lib/spaces.server"
import { assertCoachTeaches } from "@/lib/coaches.server"
import { joinActivity } from "@/lib/players.server"

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
