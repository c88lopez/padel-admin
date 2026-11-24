import { execSync } from "node:child_process"
import { Pool } from "pg"

// Empties the disposable E2E database, then applies migrations and seeds demo
// data. Run before the Playwright suite (see the `pretest:e2e*` scripts).
// With `--clean` it seeds only the bootstrap (no demo data): `make dev-reset`.
// Local-only: CI provisions its own throwaway Postgres service.
//
// The database (padel_admin_e2e in the cluster, from k8s/dev/) stays: the app's
// role can't create databases, so this drops and recreates its schemas instead.
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL
if (!E2E_DATABASE_URL) {
  throw new Error(
    "E2E_DATABASE_URL is required (run `make test-e2e`, with `make tunnel` up)"
  )
}

async function main(url: string) {
  const pool = new Pool({ connectionString: url })
  try {
    await pool.query(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
    `)
    console.log(
      `✓ Emptied disposable database "${new URL(url).pathname.slice(1)}"`
    )
  } finally {
    await pool.end()
  }

  const childEnv = { ...process.env, DATABASE_URL: url }
  execSync("bun run db:migrate", { stdio: "inherit", env: childEnv })
  const seed = process.argv.includes("--clean") ? "db:seed" : "db:seed:demo"
  execSync(`bun run ${seed}`, { stdio: "inherit", env: childEnv })
}

void main(E2E_DATABASE_URL).catch((error: unknown) => {
  console.error("E2E database reset failed:", error)
  process.exit(1)
})
