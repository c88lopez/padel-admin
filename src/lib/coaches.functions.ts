import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { coach } from "@/db/schema"
import { currentClubId, requireClubId } from "@/lib/auth.server"
import {
  createCoachRecord,
  listCoachRecords,
  updateCoachRecord,
} from "@/lib/coaches.server"

const coachInput = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  // See CoachInput (coaches.server.ts).
  activityIds: z.array(z.string().min(1)).max(20).optional(),
})

export type { CoachRecord } from "@/lib/coaches.server"

export const listCoaches = createServerFn({ method: "GET" }).handler(async () =>
  listCoachRecords(await currentClubId())
)

export const createCoach = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => coachInput.parse(data))
  .handler(async ({ data }) =>
    createCoachRecord(await requireClubId("coaches:manage"), data)
  )

export const updateCoach = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    coachInput.extend({ id: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) =>
    updateCoachRecord(await requireClubId("coaches:manage"), data)
  )

export const deleteCoach = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) => {
    const clubId = await requireClubId("coaches:manage")
    await db
      .delete(coach)
      .where(and(eq(coach.id, data.id), eq(coach.clubId, clubId)))
    return { id: data.id }
  })
