import { trace } from "@opentelemetry/api"
import pino from "pino"

// JSON logs on stdout, one object per line, which Alloy ships to Loki. Lines
// written inside a traced request carry trace_id and span_id, and Grafana
// links them to the trace in Tempo. Server-only: import it from server
// boundaries, never from a module the client bundle reaches.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Read from the active span rather than through pino's OTel instrumentation,
  // which can't patch pino here: the Nitro build bundles it.
  mixin() {
    const span = trace.getActiveSpan()
    if (!span) return {}
    const { traceId, spanId } = span.spanContext()
    return { trace_id: traceId, span_id: spanId }
  },
})
