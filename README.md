# Padel Club Admin

A database-backed admin dashboard for managing padel (and pilates) clubs: court reservations, players, coaches and classes, tournaments, inventory, sales, users, club settings, and appearance. Built on TanStack Start with shadcn/ui.

The app is currently a functional admin prototype with real Postgres persistence, Better Auth email/password sessions, role-based permissions, and per-club data scoping.

## Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (SSR) + [`@tanstack/react-router`](https://tanstack.com/router) file-based routing
- **UI**: [shadcn/ui](https://ui.shadcn.com) (`radix-rhea` style, olive base) + [Tailwind CSS v4](https://tailwindcss.com)
- **Icons**: [`@tabler/icons-react`](https://tabler.io/icons)
- **Auth**: [Better Auth](https://www.better-auth.com/) with email/password sessions
- **Database**: Postgres + [Drizzle ORM](https://orm.drizzle.team/)
- **Data & forms**: TanStack server functions, `@tanstack/react-table`, `react-hook-form` + `zod`, `recharts`, `date-fns`
- **Runtime/tooling**: React 19, TypeScript, Vite, Bun, Vitest, Playwright

## Running

It runs in the home Kubernetes cluster (the `vandelay-labs` workspace), deployed like the other services there:

- **App**: http://192.168.68.61:30084 (LAN only). `make admin-password` prints the Owner's login.
- **Deploys**: every merge to `main` that changes code is released by CI (`v0.x.y`, image `ghcr.io/c88lopez/padel-admin`). Argo CD Image Updater commits the tag to `k8s/kustomization.yaml`, and Argo CD rolls it out, running pending migrations first (`k8s/jobs/migrate.yaml`). Merge with the `release:minor` label for a minor version.
- **Database**: `padel_admin` on the cluster's shared Postgres (platform repo, `manifests/data/postgres.yaml`), through PgBouncer.
- **Secrets**: `make secrets` creates `padel-admin-deps` (database URLs, Better Auth and API secrets, the AI Gateway key from `.env`). Generated values are kept on re-runs.
- **Metrics**: Prometheus scrapes port 9464 (not exposed outside the cluster); `/api/metrics` only serves them in local dev.
- **Logs and traces**: JSON logs on stdout, one line per request (`src/lib/logger.server.ts`), which Loki collects. In the cluster, OpenTelemetry traces (HTTP, Better Auth, Postgres) go to Tempo through Alloy (`src/tracing.ts`), and each log line's `trace_id` links to its trace in Grafana. Tracing is off locally.

## Getting started

There's no local database: development uses its own databases on the cluster's Postgres, through a port-forward. You need `kubectl` access to the cluster (context `docker-desktop`) and `jq`.

```bash
bun install
cp .env.example .env   # add AI_GATEWAY_API_KEY for the assistant
make dev-setup         # once: the dev, test and e2e databases
make -C .. tunnel      # the workspace's tunnel, in its own terminal: Postgres on localhost:5432
make dev-reset         # once (and whenever you want a clean slate): padel_admin_dev with just the logins
make run               # dev server on http://localhost:3003, on padel_admin_dev
```

Development connects as `padel_admin_dev`, a database user that owns only `padel_admin_dev`, `padel_admin_test` and `padel_admin_e2e`, and that Postgres refuses on every other database. Local work never touches the deployed app's data, and your machine never holds its database password.

- `make run` applies pending migrations to `padel_admin_dev` before starting, so a branch's new migrations are in place. Log in with the local logins below.
- `make test` runs the unit and integration tests (the latter on `padel_admin_test`).
- `make test-e2e` runs Playwright on `padel_admin_e2e`, which it wipes and reseeds with demo data first.

Schema changes go through migrations: `bun run db:generate`, commit the SQL in `drizzle/`, and the deploy applies it to `padel_admin`. Don't `db:push`.

### Authentication

Authentication is handled by Better Auth. Sessions, users, accounts, and password hashes are stored in Postgres.

The seed (`bun run db:seed`) only bootstraps a clean app: the Default Club (with its default activity, four padel courts and reservation settings), its Owner account and the platform super admin. No players, reservations, inventory or other business data.

`make seed` (once, on a new cluster; it's the one local target that uses the deployed app's database user) runs it on the deployed app's database, as `admin@club.test` and `super@club.test` with generated passwords kept in the cluster (`make admin-password`).

`make dev-reset` runs it on `padel_admin_dev` with these logins:

- **Club owner**: `admin@club.test` / `admin1234`
- **Platform super admin**: `super@club.test` / `super1234`

The E2E runs use the demo seed (`bun run db:seed:demo`) instead, which adds a second club (North Branch), team members and sample data as test fixtures.

You can override seed credentials with `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`, `SEED_SUPERADMIN_EMAIL`, and `SEED_SUPERADMIN_PASSWORD`.

### Data Model

Most app data is scoped to a club. Club-scoped users operate within their home club or any additional club memberships, while the `Super Admin` role can operate across clubs.

Core tables include:

- Clubs, club memberships, users, sessions, accounts, and verification records
- Courts and per-club reservation settings
- Players and reservations
- Inventory stock items, sales, and sale line items
- Coaches and classes

## Scripts

```bash
bun run dev        # Start dev server on port 3003
bun run build      # Production build
bun run preview    # Preview the production build
bun run test       # Run tests with vitest
bun run lint       # oxlint
bun run typecheck  # TypeScript type checking (tsc --noEmit)
bun run format     # Prettier (write)
bun run check      # Prettier (check only)
bun run db:generate # Generate a SQL migration from src/db/schema.ts
```

Database and cluster tasks are Makefile targets, each described next to its definition (`dev-setup`, `dev-reset`, `run`, `test`, `test-e2e`, `seed`, `admin-password`, `image`, `secrets`, `status`, `logs`, `restart`).

## Routes

All app routes live under the `_authenticated` layout (redirects to `/login` when signed out).

| Route                     | Description                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| `/login`                  | Sign-in page                                                       |
| `/`                       | Dashboard — court occupancy, weekly reservations, today's bookings |
| `/reservations`           | Court reservations                                                 |
| `/players`                | Players                                                            |
| `/coaches`                | Coaches                                                            |
| `/coaches/classes`        | Classes                                                            |
| `/tournaments`            | Tournaments                                                        |
| `/inventory`              | Stock items                                                        |
| `/inventory/dashboard`    | Inventory dashboard                                                |
| `/inventory/sales-log`    | Sales log with expandable line items                               |
| `/settings`               | Settings index                                                     |
| `/settings/general`       | General app settings                                               |
| `/settings/reservations`  | Reservation rules, hours, and booking limits                       |
| `/settings/notifications` | Notification preferences                                           |
| `/settings/users`         | User management                                                    |
| `/settings/clubs`         | Club management for super admins                                   |
| `/settings/ui`            | Appearance and accent settings                                     |

## Current Capabilities

- Role-based access control for users, settings, players, reservations, inventory, coaches, and club provisioning
- Multi-club support with a club switcher for users who can access more than one club
- Server-side validation and club scoping for reads and writes
- Reservation conflict detection, court availability checks, opening hours, advance booking limits, and cancellation cutoff rules
- Inventory dashboard, low-stock notifications, stock management, sales logging, and sale item snapshots
- English and Spanish UI translations
- Unit tests for shared domain logic and component behavior, plus Playwright e2e setup

## Project layout

```
src/
  routes/            # File-based routes (TanStack Router)
  components/         # App components + drawers (create/edit forms)
  components/ui/      # shadcn/ui primitives
  db/                 # Drizzle schema, migrations helpers, seed/reset scripts
  lib/                # server functions, auth, permissions, settings, domain logic
  hooks/             # shared hooks
  locales/           # i18n resources
```

## Conventions & gotchas

See [`CLAUDE.md`](./CLAUDE.md) for project conventions, including the shadcn `"use client"` removal step, the `StrictMode` caveat, and dev-server notes.

## Adding shadcn components

```bash
npx shadcn@latest add button
```

Components land in `src/components/ui/`. After adding one, remove the leading `"use client"` directive (a Next.js RSC artifact that breaks SSR under Vinxi).
