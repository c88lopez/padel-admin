import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { withClubScope } from "@/db/tenant"
import { getClubRecord } from "@/lib/clubs.server"
import { setActivityEnabled } from "@/lib/activities.server"
import { seedActivitySpaces } from "@/lib/spaces.server"
import type { SetActivityEnabledResult } from "@/lib/activities.server"
import {
  ApiError,
  apiErrorResponse,
  readJsonBody,
  requirePlatformKey,
} from "@/lib/api-auth"

type Ctx = { request: Request; params: { clubId: string; templateKey: string } }

const bodySchema = z.object({ active: z.boolean() })

const FAILURES: Record<
  Extract<SetActivityEnabledResult, { ok: false }>["reason"],
  [status: number, message: string]
> = {
  unknownTemplate: [404, "Unknown activity template."],
  unavailable: [409, "This activity isn't available yet."],
  notFound: [404, "The club doesn't have this activity."],
  lastActive: [409, "A club must keep at least one enabled activity."],
}

// Hidden platform API (app owners only, PLATFORM_API_KEY):
//   PUT /api/platform/clubs/:clubId/activities/:templateKey  { "active": bool }
// Enables (creating it, with its default spaces, on first use) or disables an
// activity for a club.
export const Route = createFileRoute(
  "/api/platform/clubs/$clubId/activities/$templateKey"
)({
  server: {
    handlers: {
      PUT: async ({ request, params }: Ctx) => {
        try {
          requirePlatformKey(request)
          const { active } = bodySchema.parse(await readJsonBody(request))
          const club = await getClubRecord(params.clubId)
          if (!club) throw new ApiError(404, "Club not found.")
          // The platform API names its club, so it acts as that club (row-level
          // security, src/db/tenant.ts).
          const result = await withClubScope(club.id, async () => {
            const enabled = await setActivityEnabled(
              club.id,
              params.templateKey,
              active
            )
            // A club that gets an activity also gets its default spaces.
            if (enabled.ok && enabled.created) {
              await seedActivitySpaces(club.id, enabled.activity.id)
            }
            return enabled
          })
          if (!result.ok) throw new ApiError(...FAILURES[result.reason])
          return Response.json(result.activity)
        } catch (error) {
          return apiErrorResponse(error)
        }
      },
    },
  },
})
