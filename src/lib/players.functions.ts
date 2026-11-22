import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { currentClubId, requireClubId } from "@/lib/auth.server"
import { requireActiveActivity } from "@/lib/activities.server"
import {
  createPlayerRecord,
  deletePlayerRecord,
  listPlayerRecords,
  removePlayerFromActivity,
  updatePlayerRecord,
} from "@/lib/players.server"

export type { PlayerRecord } from "@/lib/players.server"

// The activity whose list the call is about (players, students…). Omitted, a
// save uses the club's default activity and a list returns every customer.
const activityInput = z.object({ activityId: z.string().min(1).optional() })

const playerInput = activityInput.extend({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  age: z.coerce.number().int().min(5).max(99),
  gender: z.enum(["Male", "Female"]),
  // Required by activities with levels; checked against the activity.
  category: z.string().min(1).nullable(),
})

export const listPlayers = createServerFn({ method: "GET" })
  .validator((data: unknown) => activityInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const clubId = await currentClubId()
    if (data.activityId) await requireActiveActivity(clubId, data.activityId)
    return listPlayerRecords(clubId, data.activityId)
  })

export const createPlayer = createServerFn({ method: "POST" })
  .validator((data: unknown) => playerInput.parse(data))
  .handler(async ({ data: { activityId, ...data } }) =>
    createPlayerRecord(await requireClubId("players:manage"), data, activityId)
  )

export const updatePlayer = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    playerInput.extend({ id: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data: { activityId, ...data } }) =>
    updatePlayerRecord(await requireClubId("players:manage"), data, activityId)
  )

// With an activity, takes the customer out of that list only (deleting them
// once they're in none); without one, deletes them.
export const deletePlayer = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    activityInput.extend({ id: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) => {
    const clubId = await requireClubId("players:manage")
    if (!data.activityId) return deletePlayerRecord(clubId, data.id)
    await requireActiveActivity(clubId, data.activityId)
    return removePlayerFromActivity(clubId, data.id, data.activityId)
  })
