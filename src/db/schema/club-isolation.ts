import { pgPolicy } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// Row-level security: every club-scoped table has this policy, so a
// transaction only sees and writes the rows of the club in its `app.club_id`
// setting (src/db/tenant.ts). `app.bypass_rls` is for scripts and tests.
// Migrations also FORCE row-level security, since the app's role owns the
// tables. See drizzle/CLAUDE.md.
const CLUB_ROW_CHECK = sql`club_id = current_setting('app.club_id', true) OR current_setting('app.bypass_rls', true) = 'on'`

export function clubIsolation() {
  return pgPolicy("club_isolation", {
    for: "all",
    using: CLUB_ROW_CHECK,
    withCheck: CLUB_ROW_CHECK,
  })
}
