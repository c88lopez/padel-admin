# Padel Club Admin

A database-backed admin dashboard for managing padel clubs (court reservations, players, coaches/classes, tournaments, inventory, sales, users, settings, appearance). Real Postgres persistence, Better Auth sessions, role-based permissions, per-club scoping, English/Spanish i18n, an AI assistant, Prometheus metrics, and JSON logs with OpenTelemetry traces.

## Stack

- **Framework**: TanStack Start (SSR) + `@tanstack/react-router` file-based routing
- **UI**: shadcn/ui (`radix-rhea` style, olive base) + Tailwind CSS v4, `@tabler/icons-react`
- **Auth**: Better Auth (email/password sessions in Postgres)
- **Database**: Postgres + Drizzle ORM (`pg` driver)
- **Data/forms**: TanStack server functions, `@tanstack/react-table`, `react-hook-form` + `zod`, `recharts`, `date-fns`
- **AI**: Vercel AI SDK (`ai`) via AI Gateway
- **i18n**: `i18next` / `react-i18next` (bundled `en`/`es`)
- **Tooling**: React 19, TypeScript, Vite, Bun, Vitest, Playwright

## Commands

```bash
bun run dev        # Dev server on port 3003
bun run build      # Production build
bun run test       # Unit/component tests (vitest)
bun run lint       # oxlint
bun run typecheck  # tsc --noEmit
bun run format     # Prettier write
bun run db:generate # SQL migration from src/db/schema/ (commit drizzle/)
make -C .. tunnel  # the workspace's tunnel: cluster Postgres on localhost:5432 (keep it running)
make dev-reset     # empty padel_admin_dev and seed it clean: Default Club + logins only (first time too)
make run           # migrate padel_admin_dev, then the dev server on it
make test          # unit + integration (padel_admin_test)
make test-e2e      # Playwright (wipes and reseeds padel_admin_e2e)
```

Single unit test: `bun run test -- path/to/file.test.tsx`. No local database: development uses its own databases on the cluster's Postgres through `make tunnel` (first time: `make dev-setup`, then `make dev-reset`), as `padel_admin_dev`, a user that can't reach the deployed app's `padel_admin`. Never `db:push` to the cluster; schema changes are migrations, applied on deploy.

## Deployment

Runs in the home Kubernetes cluster at http://192.168.68.61:30084, like the workspace's other services: a merge to `main` releases `v0.x.y` (CI), Argo CD Image Updater commits the tag to `k8s/kustomization.yaml`, and Argo CD deploys it after the PreSync migrate Job. `k8s/` is the deployment; the `Makefile` has the cluster tasks (`secrets`, `status`, `logs`, `restart`).

## Layout

```
src/
  routes/        # File-based routes; api/* are REST/handler routes
  components/     # App components + create/edit "drawers"
  components/ui/  # shadcn/ui primitives
  db/             # Drizzle schema, migrate/seed/reset scripts
  lib/            # server functions, auth, permissions, domain logic, i18n, ai/
  hooks/          # shared hooks
  locales/        # en.ts / es.ts
  styles.css      # Tailwind v4 theme tokens (OKLCH)
```

## Activities (multi-activity clubs)

Clubs offer one or more **activities** (padel and pilates; football and swim planned). Each activity is a row in the `activity` table pointing at a code-defined **template** in `src/lib/activities/templates.ts`. A template combines generic building blocks (`bookings`, `sessions`, `competitions`, `levels`) with defaults; the row stores the club's name override, enabled flag and config overrides (resolved by `resolveActivityConfig` in `src/lib/activities/config.ts`).

- Navigation entries declare the `block` they need (`src/lib/navigation.ts`); the sidebar and command palette only show entries whose block an active activity provides. In the sidebar, `sidebarGroup: "activity"` entries (reservations, coaches, classes, tournaments) are repeated in one group per active activity, named after it; entries with `activityFilter` link with `?activity=<id>`, which their page reads as its activity filter. The Customers group has one `/players?activity=<id>` item per active activity, labelled with that activity's word for its customers. Dashboard and Inventory stay club-wide.
- `ensureDefaultActivities(clubId)` (`src/lib/activities.server.ts`) gives a club padel when it has no activities. It runs on club creation and lazily on reads, so it also covers databases baselined without running migration backfills.
- Only the app's owners enable/disable activities, through the hidden platform API (`PUT /api/platform/clubs/:clubId/activities/:templateKey` with `{ "active": bool }`, `GET …/activities` to inspect). The first enable also creates the activity's default spaces. Templates marked `available: false` (for ones whose building blocks aren't built yet) can't be enabled, and a club must keep at least one enabled activity. e2e enables pilates only on North Branch, so the Default Club the other specs use stays padel-only. Club admins can only rename activities in Settings → Activities.
- Spaces: the bookable place is a `space` row (`src/lib/spaces.server.ts`) with a `type` and an `indoor` flag. Don't name new code or tables after courts; "Court" is only the padel type's label.
  - Space types are code-defined in `src/lib/activities/spaces.ts` (`court`, `studio`, …) with their translated name and numbered label. Show spaces with `spaceDisplayName` / `spaceNumberLabel` / `spaceNounKey`, never a hardcoded "Court".
  - A template's `spaces` says which types its spaces can be (first = default) and how many a club starts with (`defaultCount`). `seedActivitySpaces` creates them when a club gets the activity (club creation, seeding, first enable through the platform API).
  - Spaces belong to an activity (`activity_id`) and are numbered per activity (`sortOrder`: Court 1–4 and Studio 1 coexist). `linkUnassignedSpaces` links legacy rows lazily.
  - A space holds one thing at a time: reservations and classes can't overlap on it, in either direction. Every write goes through `assertSpaceFree` / `findSpaceConflict` (reservations, classes, the AI tool); existing overlapping rows aren't touched.
  - A space can only be used for the blocks its activity provides: filter lists with `spacesForBlock` (reservations: `bookings`, classes: `sessions`) and enforce it with `assertSpaceBookable(clubId, spaceId, block)`.
  - Managed in Settings → Spaces, one section per active activity. Booking length options come from the space's activity config (`bookingDurations`).
- Classes belong to an activity (`coach_class.activity_id`, set from the class's space) and have an optional `capacity` (null = no limit; defaults to the activity's `sessions.defaultCapacity`). Customers sign up through `coach_class_attendee` (Attendees in a class's row menu). Sign-ups and capacity changes lock the class row (`SELECT … FOR UPDATE`) before counting, so the last place can't be taken twice and the capacity can't drop below who's signed up. Data access is in `classes.server.ts` (one-off classes and shared helpers), `class-series.server.ts` (creating and filling series), `class-series-edit.server.ts` (scoped edits and deletes) and `class-attendees.server.ts` (sign-ups); the class form's spaces, durations (`sessionDurations`) and coaches follow the chosen activity.
- Coaches: `coach_activity` lists the activities each coach teaches (`coaches.server.ts`). A class's coach must teach its activity (`assertCoachTeaches`). With one activity that runs classes, new coaches get it automatically and the UI hides the choice; with several, it's picked in the coach form. Updating a coach's activities only replaces the active ones, so links to a disabled activity survive.
- Customers: one `player` row per person per club. A customer belongs to an activity when they have a `customer_activity_profile` row for it, which also holds the activity's level (`src/lib/players.server.ts`); one person can be in several. Migration 0019 put every existing customer in their club's padel, and signing up to a class adds the customer to its activity.
  - Each template names its customers (`customersKey`: padel "Players"/"Jugadores", pilates "Students"/"Alumnos") with a full set of phrases under `activities.<key>.customers` in both locales; read them with `customerTextKey` / `useCustomerView`. Don't hardcode "player" in customer UI.
  - `/players` lists one activity's customers (`?activity=<id>`, default: the first active one); the level column and chart show only for activities with `levels`, the booking stats only with `bookings`. Saving without an activity (AI tool, seed) uses `defaultCustomerActivity`. Deleting from a list removes the customer from that activity and deletes them once they're in none.
  - Level scales live in the template (`src/lib/activities/levels.ts`); UI outside the customers page reads them with `usePrimaryLevelScale()`.
- Bookings keep the typed name and link `customer_id` only when it matches exactly one player (`findCustomerIdByName`).
- New sport = new template. Add DB columns/tables only for genuinely new building blocks, as additive migrations.

## Observability

- Log with `logger` from `src/lib/logger.server.ts` (pino, JSON on stdout), never `console.*`. Pass errors as `{ err }`. Lines written during a request carry `trace_id`/`span_id`.
- `src/lib/request-log-middleware.ts` logs one line per request (path, never the query string), skipping the probes.
- Tracing is a preload, not an import: `bun run build:tracing` bundles `src/tracing.ts` into `.output/server/tracing.mjs`, and the image runs `node --import` on it. It's on only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (the ConfigMap sets Alloy's OTLP/HTTP port).
- Auto-instrumentation only patches packages left out of the Nitro bundle: `pg` is kept external with `traceDeps` in `vite.config.ts`. Add a package there before adding its instrumentation.
