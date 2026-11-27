import { createFileRoute } from "@tanstack/react-router"
import {
  clubInput,
  createClubRecord,
  listClubRecords,
} from "@/lib/clubs.server"
import {
  apiErrorResponse,
  readJsonBody,
  requirePlatformKey,
} from "@/lib/api-auth"

// Hidden platform API (app owners only, PLATFORM_API_KEY):
//   GET  /api/platform/clubs — list every club
//   POST /api/platform/clubs — create a club with its default activity, spaces
//                              and reservation settings
export const Route = createFileRoute("/api/platform/clubs/")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          requirePlatformKey(request)
          return Response.json(await listClubRecords())
        } catch (error) {
          return apiErrorResponse(error)
        }
      },
      POST: async ({ request }: { request: Request }) => {
        try {
          requirePlatformKey(request)
          const data = clubInput.parse(await readJsonBody(request))
          const created = await createClubRecord(data)
          return Response.json(created, { status: 201 })
        } catch (error) {
          return apiErrorResponse(error)
        }
      },
    },
  },
})
