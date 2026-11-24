import { and, count, eq } from "drizzle-orm"
import { db } from "@/db"
import type { Tx } from "@/db"
import { classSeries, coachClass, coachClassAttendee } from "@/db/schema"
import type { CoachClass } from "@/db/schema"
import { AppError } from "@/lib/errors"
import { assertSpaceBookable, assertSpaceFree } from "@/lib/spaces.server"
import { assertCoachTeaches } from "@/lib/coaches.server"
import { getReservationSettingsRecord } from "@/lib/reservation-settings.server"
import { nowInZone, todayInZone } from "@/lib/tz"

// Data access for one-off classes, and the class helpers the series and
// attendee modules share (no auth). Server-only so the Postgres driver stays
// out of the client bundle; wrapped by classes.functions.ts. Series live in
// class-series(-edit).server.ts, sign-ups in class-attendees.server.ts.

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

export async function clubToday(clubId: string): Promise<string> {
  return todayInZone((await getReservationSettingsRecord(clubId)).timezone)
}

// The club's wall clock, which decides which classes have ended.
export async function clubNow(clubId: string): Promise<ClubNow> {
  return nowInZone((await getReservationSettingsRecord(clubId)).timezone)
}

export interface ClubNow {
  date: string
  time: string
}

// Locks this club's class row for the rest of the transaction (FOR UPDATE),
// so sign-ups and capacity changes on it run one at a time.
export async function lockClass(
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

export async function countAttendees(tx: Tx, classId: string): Promise<number> {
  const [{ value }] = await tx
    .select({ value: count() })
    .from(coachClassAttendee)
    .where(eq(coachClassAttendee.classId, classId))
  return value
}

// The class and its series (null for a one-off class), in this club.
export async function classWithSeries(clubId: string, classId: string) {
  const rows = await db
    .select({ cls: coachClass, series: classSeries })
    .from(coachClass)
    .leftJoin(classSeries, eq(classSeries.id, coachClass.seriesId))
    .where(and(eq(coachClass.id, classId), eq(coachClass.clubId, clubId)))
  return rows.at(0)
}
