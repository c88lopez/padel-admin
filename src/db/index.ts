import { drizzle } from "drizzle-orm/node-postgres"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"
import { currentScope, scopePoolQueries, scopeStatement } from "./tenant"

type Database = NodePgDatabase<typeof schema> & { $client: Pool }

/**
 * A drizzle instance whose queries and transactions carry the current tenant
 * scope (src/db/tenant.ts), which the row-level security policies read.
 */
export function createScopedDb(pool: Pool): Database {
  scopePoolQueries(pool)
  const scoped = drizzle(pool, { schema })
  const transaction = scoped.transaction.bind(scoped)
  scoped.transaction = (run, config) =>
    transaction(async (tx) => {
      const scope = currentScope()
      if (scope) await tx.execute(scopeStatement(scope))
      return run(tx)
    }, config)
  return scoped
}

// One pool per server process. The Pool connects lazily, so importing this
// module without a live DB is safe. In the cluster DB_POOL_MAX caps it (the
// connections go through PgBouncer, see k8s/app/10-configmap.yaml); unset, pg's
// default of 10 applies.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : undefined,
})

export const db = createScopedDb(pool)
