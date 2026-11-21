import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { coachClass } from "@/db/schema"
import type { CoachClass } from "@/db/schema"
import { assertSpaceBookable } from "@/lib/spaces.server"

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
  // The class is for its space's activity.
  const activity = await assertSpaceBookable(clubId, data.spaceId, "sessions")
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
  const [updated] = await db
    .update(coachClass)
    .set({ ...values, activityId: activity.id })
    .where(and(eq(coachClass.id, id), eq(coachClass.clubId, clubId)))
    .returning()
  return updated
}
