import { createStart } from "@tanstack/react-start"
import { metricsRequestMiddleware } from "@/lib/metrics-middleware"
import { requestLogMiddleware } from "@/lib/request-log-middleware"

// Global Start instance. Registers the Prometheus and request-log middlewares,
// so every request the server handles (page renders + server functions) is
// timed, counted and logged. Their `.server()` bodies are the only places that
// pull in `prom-client` and pino, keeping them out of the client bundle.
export const startInstance = createStart(() => ({
  requestMiddleware: [metricsRequestMiddleware, requestLogMiddleware],
}))
