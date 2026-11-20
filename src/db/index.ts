import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// One pool per server process. The Pool connects lazily, so importing this
// module without a live DB is safe. In the cluster DB_POOL_MAX caps it (the
// connections go through PgBouncer, see k8s/app/10-configmap.yaml); unset, pg's
// default of 10 applies.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : undefined,
})

export const db = drizzle(pool, { schema })
