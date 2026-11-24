import { createMiddleware } from "@tanstack/react-start"

// Global request middleware that gives every request its own row-level
// security scope (src/db/tenant.ts). resolveActiveClubId fills it in with the
// request's club; until then, club-scoped tables look empty. Imported
// dynamically inside `.server()`, like the other global middlewares, so
// `node:async_hooks` and the database never reach the client bundle.
export const tenantScopeMiddleware = createMiddleware({
  type: "request",
}).server(async ({ next }) => {
  const { runRequest } = await import("@/db/tenant")
  return runRequest(() => next())
})
