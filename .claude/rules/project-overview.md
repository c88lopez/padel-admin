# Padel Club Admin

A database-backed admin dashboard for managing padel clubs (court reservations, players, coaches/classes, tournaments, inventory, sales, users, settings, appearance). Real Postgres persistence, Better Auth sessions, role-based permissions, per-club scoping, English/Spanish i18n, an AI assistant, and Prometheus metrics.

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
bun run lint       # ESLint
bun run typecheck  # tsc --noEmit
bun run format     # Prettier write
bun run db:generate # SQL migration from src/db/schema.ts (commit drizzle/)
make tunnel        # cluster Postgres on localhost:5433 (keep it running)
make dev-reset     # empty padel_admin_dev and load demo data (first time too)
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
