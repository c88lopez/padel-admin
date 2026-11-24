import { createFileRoute } from "@tanstack/react-router"
import { withClubScope } from "@/db/tenant"
import { getClubRecord } from "@/lib/clubs.server"
import { listActivityRecords } from "@/lib/activities.server"
import { ACTIVITY_TEMPLATES } from "@/lib/activities/templates"
import { ApiError, apiErrorResponse, requirePlatformKey } from "@/lib/api-auth"

type Ctx = { request: Request; params: { clubId: string } }

// Hidden platform API (app owners only, PLATFORM_API_KEY):
//   GET /api/platform/clubs/:clubId/activities — the club's activities plus
//   every template and whether it can be enabled yet.
export const Route = createFileRoute("/api/platform/clubs/$clubId/activities/")(
  {
    server: {
      handlers: {
        GET: async ({ request, params }: Ctx) => {
          try {
            requirePlatformKey(request)
            const club = await getClubRecord(params.clubId)
            if (!club) throw new ApiError(404, "Club not found.")
            const activities = await withClubScope(club.id, () =>
              listActivityRecords(club.id)
            )
            return Response.json({
              club: { id: club.id, name: club.name },
              activities,
              templates: ACTIVITY_TEMPLATES.map((template) => ({
                key: template.key,
                available: template.available,
                blocks: template.blocks,
              })),
            })
          } catch (error) {
            return apiErrorResponse(error)
          }
        },
      },
    },
  }
)
