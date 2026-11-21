import { createServerFn } from "@tanstack/react-start"
import { and, asc, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { coach, coachClass, coachClassAttendee, space } from "@/db/schema"
import { currentClubId, requireClubId } from "@/lib/auth.server"
import {
  addAttendeeRecord,
  createClassRecord,
  listAttendeeRecords,
  removeAttendeeRecord,
  updateClassRecord,
} from "@/lib/classes.server"

export type { AttendeeRecord } from "@/lib/classes.server"

const classInput = z.object({
  coachId: z.string().min(1),
  spaceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.coerce.number().int().min(15).max(360),
  // See ClassInput (classes.server.ts).
  capacity: z.coerce.number().int().min(1).max(500).nullable().optional(),
})

export interface ClassRecord {
  id: string
  coachId: string | null
  coachName: string
  activityId: string
  spaceId: string
  spaceName: string
  spaceType: string
  spaceNumber: number
  date: string
  startTime: string
  durationMinutes: number
  capacity: number | null
  attendeeCount: number
}

export const listClasses = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClassRecord[]> => {
    const clubId = await currentClubId()
    const rows = await db
      .select({
        id: coachClass.id,
        coachId: coachClass.coachId,
        coachName: coach.name,
        activityId: coachClass.activityId,
        spaceId: coachClass.spaceId,
        spaceName: space.name,
        spaceType: space.type,
        spaceNumber: space.sortOrder,
        date: coachClass.date,
        startTime: coachClass.startTime,
        durationMinutes: coachClass.durationMinutes,
        capacity: coachClass.capacity,
        attendeeCount: sql<number>`(
          select count(*)::int from ${coachClassAttendee}
          where ${coachClassAttendee.classId} = ${coachClass.id}
        )`,
      })
      .from(coachClass)
      .innerJoin(space, eq(coachClass.spaceId, space.id))
      .leftJoin(coach, eq(coachClass.coachId, coach.id))
      .where(eq(coachClass.clubId, clubId))
      .orderBy(asc(coachClass.date), asc(coachClass.startTime))

    return rows.map((row) => ({
      ...row,
      coachName: row.coachName ?? "—",
    }))
  }
)

export const createClass = createServerFn({ method: "POST" })
  .validator((data: unknown) => classInput.parse(data))
  .handler(async ({ data }) =>
    createClassRecord(await requireClubId("coaches:manage"), data)
  )

export const updateClass = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    classInput.extend({ id: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) =>
    updateClassRecord(await requireClubId("coaches:manage"), data)
  )

export const deleteClass = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ id: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) => {
    const clubId = await requireClubId("coaches:manage")
    await db
      .delete(coachClass)
      .where(and(eq(coachClass.id, data.id), eq(coachClass.clubId, clubId)))
    return { id: data.id }
  })

const attendeeInput = z.object({
  classId: z.string().min(1),
  playerId: z.string().min(1),
})

export const listClassAttendees = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ classId: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) =>
    listAttendeeRecords(await currentClubId(), data.classId)
  )

export const addClassAttendee = createServerFn({ method: "POST" })
  .validator((data: unknown) => attendeeInput.parse(data))
  .handler(async ({ data }) =>
    addAttendeeRecord(
      await requireClubId("coaches:manage"),
      data.classId,
      data.playerId
    )
  )

export const removeClassAttendee = createServerFn({ method: "POST" })
  .validator((data: unknown) => attendeeInput.parse(data))
  .handler(async ({ data }) =>
    removeAttendeeRecord(
      await requireClubId("coaches:manage"),
      data.classId,
      data.playerId
    )
  )
