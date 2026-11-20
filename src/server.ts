import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import { startMetricsServer } from "@/lib/metrics.server"

// Custom server entry: the default one, plus the Prometheus listener on its
// own port when METRICS_PORT is set (in the cluster), so /metrics isn't
// reachable through the app's Service. Without it, /api/metrics serves them.
if (process.env.METRICS_PORT) {
  startMetricsServer(Number(process.env.METRICS_PORT))
}

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request)
  },
})
