// Part of `bun run build:tracing`, which bundles the tracing preload
// (src/tracing.ts) into .output/server/tracing.mjs, next to the Nitro server.
//
// import-in-the-middle can't be bundled: it loads its own files by path. The
// bundle leaves it external, and this copies it, with what it needs, into
// .output/server/node_modules using nf3, the tracer Nitro uses for the
// server's own externals (pg). The server never imports it, so Nitro doesn't
// ship it.
import { fileURLToPath } from "node:url"
import { traceNodeModules } from "nf3"

await traceNodeModules(
  ["import-in-the-middle", "import-in-the-middle/register-hooks.mjs"].map(
    (specifier) => fileURLToPath(import.meta.resolve(specifier))
  ),
  { outDir: ".output/server" }
)
