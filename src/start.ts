import { createCsrfMiddleware, createStart } from "@tanstack/react-start"
import { metricsRequestMiddleware } from "@/lib/metrics-middleware"
import { requestLogMiddleware } from "@/lib/request-log-middleware"

// Rejects cross-site calls to server functions (403) by checking
// Sec-Fetch-Site, then Origin, then Referer against the request's own origin.
// Page renders and server routes (e.g. Better Auth's /api/auth) are skipped.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
})

// Global Start instance. Registers the Prometheus and request-log middlewares,
// so every request the server handles (page renders + server functions) is
// timed, counted and logged. Their `.server()` bodies are the only places that
// pull in `prom-client` and pino, keeping them out of the client bundle. CSRF
// runs last so rejected requests are still counted and logged.
export const startInstance = createStart(() => ({
  requestMiddleware: [
    metricsRequestMiddleware,
    requestLogMiddleware,
    csrfMiddleware,
  ],
}))
