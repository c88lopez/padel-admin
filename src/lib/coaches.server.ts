import { and, asc, eq, inArray, notInArray } from "drizzle-orm"
import { db } from "@/db"
import { coach, coachActivity } from "@/db/schema"
import type { Coach } from "@/db/schema"
import { AppError } from "@/lib/errors"
import { listActivityRecords } from "@/lib/activities.server"
import { activityProvides } from "@/lib/activities/templates"

// Data access for coaches and the activities they teach (no auth).
// Server-only so the Postgres driver stays out of the client bundle; wrapped
// by coaches.functions.ts and used by class writes.

export interface CoachRecord extends Coach {
  // Activities the coach can teach, including disabled ones.
  activityIds: string[]
}

export interface CoachInput {
  name: string
  phone: string
  birthday?: string | null
  // Omitted: the club's only activity with classes (create) or unchanged
  // (update).
  activityIds?: string[]
}

// The club's active activities that run classes: the ones a coach can be
// given.
async function teachableActivityIds(clubId: string): Promise<string[]> {
  return (await listActivityRecords(clubId))
    .filter((a) => activityProvides(a, "sessions"))
    .map((a) => a.id)
}

/**
 * The activities to give a coach: the requested ones, which must all run
 * classes in this club, or when omitted the club's only such activity.
 */
async function resolveActivityIds(
  clubId: string,
  requested: string[] | undefined
): Promise<string[]> {
  const teachable = await teachableActivityIds(clubId)
  if (requested === undefined) {
    if (teachable.length === 1) return teachable
    throw new AppError(
      "errors.coach.activityRequired",
      "Elige al menos una actividad que enseñe este entrenador."
    )
  }
  const unique = [...new Set(requested)]
  if (unique.length === 0)
    throw new AppError(
      "errors.coach.activityRequired",
      "Elige al menos una actividad que enseñe este entrenador."
    )
  if (unique.some((id) => !teachable.includes(id))) {
    throw new AppError("errors.activity.notFound", "Actividad no encontrada.")
  }
  return unique
}

export async function listCoachRecords(clubId: string): Promise<CoachRecord[]> {
  const coaches = await db
    .select()
    .from(coach)
    .where(eq(coach.clubId, clubId))
    .orderBy(asc(coach.name))
  if (coaches.length === 0) return []
  const links = await db
    .select()
    .from(coachActivity)
    .where(
      inArray(
        coachActivity.coachId,
        coaches.map((c) => c.id)
      )
    )
  return coaches.map((c) => ({
    ...c,
    activityIds: links
      .filter((l) => l.coachId === c.id)
      .map((l) => l.activityId),
  }))
}

export async function createCoachRecord(
  clubId: string,
  data: CoachInput
): Promise<CoachRecord> {
  const activityIds = await resolveActivityIds(clubId, data.activityIds)
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(coach)
      .values({
        name: data.name,
        phone: data.phone,
        birthday: data.birthday ?? null,
        clubId,
      })
      .returning()
    await tx.insert(coachActivity).values(
      activityIds.map((activityId) => ({
        coachId: created.id,
        activityId,
        clubId,
      }))
    )
    return { ...created, activityIds }
  })
}

export async function updateCoachRecord(
  clubId: string,
  data: CoachInput & { id: string }
): Promise<CoachRecord | undefined> {
  const activityIds =
    data.activityIds === undefined
      ? undefined
      : await resolveActivityIds(clubId, data.activityIds)
  const teachable = await teachableActivityIds(clubId)
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(coach)
      .set({
        name: data.name,
        phone: data.phone,
        birthday: data.birthday ?? null,
      })
      .where(and(eq(coach.id, data.id), eq(coach.clubId, clubId)))
      .returning()
    const updated = rows.at(0)
    if (!updated) return undefined
    if (activityIds) {
      // Only the choosable (active) activities are replaced; links to
      // disabled ones stay for when they're enabled again.
      await tx
        .delete(coachActivity)
        .where(
          and(
            eq(coachActivity.coachId, updated.id),
            inArray(coachActivity.activityId, teachable),
            notInArray(coachActivity.activityId, activityIds)
          )
        )
      await tx
        .insert(coachActivity)
        .values(
          activityIds.map((activityId) => ({
            coachId: updated.id,
            activityId,
            clubId,
          }))
        )
        .onConflictDoNothing()
    }
    const links = await tx
      .select({ activityId: coachActivity.activityId })
      .from(coachActivity)
      .where(eq(coachActivity.coachId, updated.id))
    return { ...updated, activityIds: links.map((l) => l.activityId) }
  })
}

/** Ensures the coach is in this club and teaches the activity. */
export async function assertCoachTeaches(
  clubId: string,
  coachId: string,
  activityId: string
): Promise<void> {
  const rows = await db
    .select({ coachId: coachActivity.coachId })
    .from(coachActivity)
    .innerJoin(coach, eq(coach.id, coachActivity.coachId))
    .where(
      and(
        eq(coach.clubId, clubId),
        eq(coachActivity.coachId, coachId),
        eq(coachActivity.activityId, activityId)
      )
    )
    .limit(1)
  if (rows.length === 0)
    throw new AppError(
      "errors.coach.wrongActivity",
      "Ese entrenador no enseña esta actividad. Elige otro."
    )
}
