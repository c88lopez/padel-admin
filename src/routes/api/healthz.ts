import { createFileRoute } from "@tanstack/react-router"

// Liveness probe: the server process is up and handling requests. Doesn't
// touch the database, so a database outage doesn't get the pod restarted.
export const Route = createFileRoute("/api/healthz")({
  server: {
    handlers: {
      GET: () => new Response("ok", { status: 200 }),
    },
  },
})
