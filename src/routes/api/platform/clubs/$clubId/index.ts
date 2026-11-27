import { createFileRoute } from "@tanstack/react-router"
import {
  clubPatchInput,
  deleteClubRecord,
  getClubRecord,
  updateClubRecord,
} from "@/lib/clubs.server"
import {
  ApiError,
  apiErrorResponse,
  readJsonBody,
  requirePlatformKey,
} from "@/lib/api-auth"

type Ctx = { request: Request; params: { clubId: string } }

// Hidden platform API (app owners only, PLATFORM_API_KEY):
//   GET    /api/platform/clubs/:clubId — fetch one club
//   PATCH  /api/platform/clubs/:clubId — update name/status (partial)
//   DELETE /api/platform/clubs/:clubId — delete a club and all of its data.
//          409 for the Default Club, and while a member belongs to no other
//          club (every user needs one).
export const Route = createFileRoute("/api/platform/clubs/$clubId/")({
  server: {
    handlers: {
      GET: async ({ request, params }: Ctx) => {
        try {
          requirePlatformKey(request)
          const record = await getClubRecord(params.clubId)
          if (!record) throw new ApiError(404, "Club not found.")
          return Response.json(record)
        } catch (error) {
          return apiErrorResponse(error)
        }
      },
      PATCH: async ({ request, params }: Ctx) => {
        try {
          requirePlatformKey(request)
          const data = clubPatchInput.parse(await readJsonBody(request))
          const updated = await updateClubRecord({
            id: params.clubId,
            ...data,
          })
          return Response.json(updated)
        } catch (error) {
          return apiErrorResponse(error)
        }
      },
      DELETE: async ({ request, params }: Ctx) => {
        try {
          requirePlatformKey(request)
          return Response.json(await deleteClubRecord(params.clubId))
        } catch (error) {
          return apiErrorResponse(error)
        }
      },
    },
  },
})
