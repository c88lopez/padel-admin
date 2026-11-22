import { createServerFn } from "@tanstack/react-start"
import { asc, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import {
  classSeries,
  coach,
  coachClass,
  coachClassAttendee,
  space,
} from "@/db/schema"
import { currentClubId, requireClubId } from "@/lib/auth.server"
import {
  addAttendeeRecord,
  createClassRecord,
  createClassSeriesRecord,
  deleteClassRecord,
  fillSeriesAhead,
  listAttendeeRecords,
  removeAttendeeRecord,
  seriesRule,
  updateClassRecord,
  updateClassSeriesRecord,
} from "@/lib/classes.server"
import { monthlyOptions } from "@/lib/recurrence"
import type { RecurrenceRule } from "@/lib/recurrence"

export type {
  AttendeeRecord,
  SeriesEditResult,
  SeriesScope,
} from "@/lib/classes.server"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const classInput = z.object({
  coachId: z.string().min(1),
  spaceId: z.string().min(1),
  date: isoDate,
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.coerce.number().int().min(15).max(360),
  // See ClassInput (classes.server.ts).
  capacity: z.coerce.number().int().min(1).max(500).nullable().optional(),
})

const recurrenceRule = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().min(1).max(99),
    weekdays: z
      .array(
        z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
          z.literal(6),
          z.literal(7),
        ])
      )
      .max(7),
    monthlyBy: z
      .enum(["day_of_month", "weekday_of_month", "last_weekday_of_month"])
      .nullable(),
    startDate: isoDate,
    until: isoDate.nullable(),
    count: z.number().int().min(1).max(1000).nullable(),
    exdates: z.array(isoDate).max(400),
  })
  .refine((r) => r.until === null || r.count === null)
  .refine((r) => r.until === null || r.until >= r.startDate)
  .refine((r) => r.frequency === "weekly" || r.weekdays.length === 0)
  .refine(
    (r) =>
      r.monthlyBy === null ||
      (r.frequency === "monthly" &&
        monthlyOptions(r.startDate).includes(r.monthlyBy))
  )

const classSeriesInput = classInput
  .omit({ date: true })
  .extend({ rule: recurrenceRule })

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
  // The series the class belongs to; null for a one-off class.
  series: { id: string; rule: RecurrenceRule } | null
}

export const listClasses = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClassRecord[]> => {
    const clubId = await currentClubId()
    await fillSeriesAhead(clubId)
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
        series: classSeries,
      })
      .from(coachClass)
      .innerJoin(space, eq(coachClass.spaceId, space.id))
      .leftJoin(coach, eq(coachClass.coachId, coach.id))
      .leftJoin(classSeries, eq(coachClass.seriesId, classSeries.id))
      .where(eq(coachClass.clubId, clubId))
      .orderBy(asc(coachClass.date), asc(coachClass.startTime))

    return rows.map(({ series, ...row }) => ({
      ...row,
      coachName: row.coachName ?? "—",
      series: series && { id: series.id, rule: seriesRule(series) },
    }))
  }
)

export const createClass = createServerFn({ method: "POST" })
  .validator((data: unknown) => classInput.parse(data))
  .handler(async ({ data }) =>
    createClassRecord(await requireClubId("coaches:manage"), data)
  )

export const createClassSeries = createServerFn({ method: "POST" })
  .validator((data: unknown) => classSeriesInput.parse(data))
  .handler(async ({ data }) =>
    createClassSeriesRecord(await requireClubId("coaches:manage"), data)
  )

export const updateClassSeries = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    classInput
      .extend({
        id: z.string().min(1),
        scope: z.enum(["following", "all"]),
        capacity: classInput.shape.capacity.unwrap(),
        rule: recurrenceRule,
        confirmed: z.boolean(),
      })
      .parse(data)
  )
  .handler(async ({ data }) =>
    updateClassSeriesRecord(await requireClubId("coaches:manage"), data)
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
    z
      .object({
        id: z.string().min(1),
        scope: z.enum(["this", "following", "all"]).default("this"),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    await deleteClassRecord(
      await requireClubId("coaches:manage"),
      data.id,
      data.scope
    )
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
