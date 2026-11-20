import { createFileRoute } from "@tanstack/react-router"
import { checkDatabase } from "@/lib/health.server"

// Readiness probe: the pod only gets traffic while it can reach Postgres.
export const Route = createFileRoute("/api/readyz")({
  server: {
    handlers: {
      GET: async () => {
        const database = await checkDatabase()
        return Response.json(
          { database },
          { status: database === "up" ? 200 : 503 }
        )
      },
    },
  },
})
