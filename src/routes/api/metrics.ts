import { createFileRoute } from "@tanstack/react-router"
import { getMetrics, getMetricsContentType } from "@/lib/metrics.server"

// Prometheus scrape endpoint for local dev: GET /api/metrics returns the
// registry in the text exposition format, unauthenticated. When METRICS_PORT
// is set (the cluster), the metrics are served on that port instead (see
// src/server.ts) and this route is a 404, so they aren't reachable through the
// app's Service.
export const Route = createFileRoute("/api/metrics")({
  server: {
    handlers: {
      GET: async () => {
        if (process.env.METRICS_PORT) {
          return new Response("Not Found", { status: 404 })
        }
        const body = await getMetrics()
        return new Response(body, {
          status: 200,
          headers: { "content-type": getMetricsContentType() },
        })
      },
    },
  },
})
