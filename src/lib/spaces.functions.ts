import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { currentClubId, requireClubId } from "@/lib/auth.server"
import {
  countSpaceUsageRecord,
  createSpaceRecord,
  deleteSpaceRecord,
  listSpaceRecords,
  updateSpaceRecord,
} from "@/lib/spaces.server"

// Type-only re-export so client imports keep working without pulling the server
// module into the client bundle.
export type { SpaceRecord, SpaceUsage } from "@/lib/spaces.server"

const createInput = z.object({
  activityId: z.string().min(1),
  type: z.string().min(1).optional(),
  indoor: z.boolean().default(true),
  active: z.boolean().default(true),
})

const updateInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60).optional(),
  type: z.string().min(1).optional(),
  indoor: z.boolean().optional(),
  active: z.boolean().optional(),
})

const idInput = z.object({ id: z.string().min(1) })

// Readable by any authenticated user in the club (the reservation timeline and
// booking drawer both need the space list).
export const listSpaces = createServerFn({ method: "GET" }).handler(
  async () => {
    const clubId = await currentClubId()
    return listSpaceRecords(clubId)
  }
)

export const createSpace = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createInput.parse(data))
  .handler(async ({ data }) => {
    const clubId = await requireClubId("settings:manage")
    return createSpaceRecord(clubId, data)
  })

export const updateSpace = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateInput.parse(data))
  .handler(async ({ data }) => {
    const clubId = await requireClubId("settings:manage")
    return updateSpaceRecord(clubId, data)
  })

export const countSpaceUsage = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }) => {
    const clubId = await currentClubId()
    return countSpaceUsageRecord(clubId, data.id)
  })

export const deleteSpace = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }) => {
    const clubId = await requireClubId("settings:manage")
    return deleteSpaceRecord(clubId, data.id)
  })
