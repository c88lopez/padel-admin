# Auth, permissions & scoping

- Roles and the permission matrix live in `src/lib/permissions.ts` (`can(role, permission)`), shared by server enforcement and client UI gating. No role bypasses it, and every user belongs to at least one club: there's no all-clubs account in the UI.
- Server functions enforce access via `auth.server.ts`: `requireSession`, `requirePermission`, `currentClubId` (scoping reads), `requireClubId(permission)` (scoping + authorizing writes).
- Almost all data is **club-scoped**. Every query filters by the active club id; never trust a client-supplied club id. Users who belong to several clubs switch between them via the `active_club_id` cookie, which only ever selects one of their own clubs. Owners and Admins only assign users to clubs they belong to (`users.functions.ts`).
- Postgres row-level security backs that up: every club table has `club_id` and a `club_isolation` policy, and `resolveActiveClubId` scopes the request to its club (`src/db/tenant.ts`). Work on a club named explicitly (not the active one) goes in `withClubScope(clubId, fn)`. Details and migration rules: `drizzle/CLAUDE.md`.
- Route guards (`route-guards.ts` `ensurePermission`) are UX-only redirects; server functions are the real authority.
- REST routes under `src/routes/api/*` use `api-auth.ts` (`requireApiAccess`): accepts either a `Bearer ADMIN_API_KEY` token or a permitted session, plus `apiErrorResponse` for consistent JSON errors. Use constant-time comparison for secrets; never log or expose them.

- The hidden **platform API** (`src/routes/api/platform/*`) is for the app's owners only: club provisioning (`/api/platform/clubs`) and activities. It uses `requirePlatformKey` (`api-auth.ts`): only a `Bearer PLATFORM_API_KEY` token, never a session, and it answers 404 on a missing/wrong key (or when the key is unset) so the endpoints stay hidden. Don't link it from the UI.

# Error handling

- Server functions throw `AppError(code, message, params?)` from `src/lib/errors.ts`: a stable `code` for logic, the Spanish `message` to show, and optional `params` the client acts on. All three are serialized across the server→client boundary; show the message with `errorMessage(err, fallback?)` and read code/params with `appErrorPayload`.
- REST API routes keep their own English JSON contract via `ApiError` — do not mix the two models.
