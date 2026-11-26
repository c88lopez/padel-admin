import { sql } from "drizzle-orm"

// Database default for `created_at` columns. They're `timestamp` without time
// zone, and Drizzle writes JS dates into them as UTC, so the default is the
// current UTC time whatever the session's TimeZone is. Rows inserted outside
// Drizzle (raw SQL, data migrations) get a creation time too.
export const utcNow = sql`timezone('utc', now())`
