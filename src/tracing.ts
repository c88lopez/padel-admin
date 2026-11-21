// OpenTelemetry tracing, as in deny-list. It must load before anything it
// instruments, so the server doesn't import it: `bun run build:tracing`
// bundles it to .output/server/tracing.mjs and node runs it first with
// `node --import ./.output/server/tracing.mjs .output/server/index.mjs`.
//
// Off when OTEL_EXPORTER_OTLP_ENDPOINT is unset (local dev). In the cluster
// it's Alloy's OTLP/HTTP port (k8s/app/10-configmap.yaml), which forwards to
// Tempo. HTTP rather than deny-list's gRPC: bundled, the gRPC exporter fails
// with "Channel credentials must be a ChannelCredentials object". The SDK
// reads the standard OTEL_* variables too (OTEL_SERVICE_NAME,
// OTEL_TRACES_SAMPLER...).
//
// pg is only patched because the Nitro build keeps it out of the bundle
// (traceDeps in vite.config.ts): instrumentations hook module loading, and a
// bundled copy is never loaded as `pg`.
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg"
import { NodeSDK } from "@opentelemetry/sdk-node"
import {
  register,
  supportsSyncHooks,
} from "import-in-the-middle/register-hooks.mjs"

const PROBES = new Set(["/api/healthz", "/api/readyz"])

if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // Tracing is off.
} else if (!supportsSyncHooks()) {
  // Node before 24.11.1 can't run the hook below. Tracing is optional, so the
  // app runs without it rather than not at all.
  console.warn(
    `tracing is off: Node ${process.version} can't run synchronous loader hooks (needs 24.11.1 or later)`
  )
} else {
  // The server is ESM: this hook lets the instrumentations patch modules
  // loaded with `import`, not only `require`.
  register()

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "padel-admin",
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation({
        // The kubelet's probes would be most of the traces.
        ignoreIncomingRequestHook: (req) => PROBES.has(req.url ?? ""),
      }),
      new PgInstrumentation(),
    ],
  })
  sdk.start()

  // Flush the spans still buffered before the pod stops.
  process.once("SIGTERM", () => {
    sdk.shutdown().catch((err: unknown) => {
      console.error("tracing shutdown failed", err)
    })
  })
}
