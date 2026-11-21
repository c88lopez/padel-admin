import { createMiddleware } from "@tanstack/react-start"

// The kubelet's probes would be most of the lines.
const PROBES = new Set(["/api/healthz", "/api/readyz"])

// Global request middleware that writes one JSON log line per request the
// Start server handles. The logger is loaded with a dynamic import inside the
// `.server()` body, as in metrics-middleware.ts, so pino never reaches the
// client bundle.
export const requestLogMiddleware = createMiddleware({
  type: "request",
}).server(async ({ request, next, handlerType }) => {
  const start = performance.now()
  const path = new URL(request.url).pathname
  let status = 500
  try {
    const result = await next()
    status = result.response.status
    return result
  } finally {
    if (!PROBES.has(path)) {
      try {
        const { logger } = await import("@/lib/logger.server")
        // The path only, never the query string, which can carry tokens.
        logger.info(
          {
            method: request.method,
            path,
            kind: handlerType,
            status,
            duration_ms: Math.round(performance.now() - start),
          },
          "request"
        )
      } catch {
        // Logging must never affect request handling.
      }
    }
  }
})
