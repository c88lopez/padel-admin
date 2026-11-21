import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { currentClubId, requireClubId } from "@/lib/auth.server"
import {
  listActivityRecords,
  renameActivityRecord,
} from "@/lib/activities.server"

export type { ActivityRecord } from "@/lib/activities.server"

export const listActivities = createServerFn({ method: "GET" }).handler(
  async () => listActivityRecords(await currentClubId())
)

// Club admins can only rename their activities. Which activities a club has
// (and whether they're enabled) is managed by the app's owners through the
// platform API.
const renameActivityInput = z.object({
  id: z.string().min(1),
  name: z.string().max(60).nullable(),
})

export const renameActivity = createServerFn({ method: "POST" })
  .validator((data: unknown) => renameActivityInput.parse(data))
  .handler(async ({ data }) =>
    renameActivityRecord(await requireClubId("settings:manage"), data)
  )
