// CI only: hands the job's throwaway database to an ordinary role, so the
// integration and e2e jobs run like the cluster does (padel_admin owns its
// database but isn't a superuser). Superusers skip row-level security, which
// would hide a missing policy or scope.
//
//   bun run scripts/ci-db-owner.ts <superuser url> <role> <password>
import { Client } from "pg"

const [url, role, password] = process.argv.slice(2)
if (!url || !role || !password) {
  throw new Error("usage: ci-db-owner.ts <superuser url> <role> <password>")
}

const client = new Client({ connectionString: url })
await client.connect()
try {
  const database = new URL(url).pathname.slice(1)
  await client.query(
    `CREATE ROLE ${client.escapeIdentifier(role)} LOGIN PASSWORD ${client.escapeLiteral(password)}`
  )
  // Since Postgres 15 the public schema belongs to the database owner.
  await client.query(
    `ALTER DATABASE ${client.escapeIdentifier(database)} OWNER TO ${client.escapeIdentifier(role)}`
  )
  console.log(`✓ ${database} is owned by ${role}`)
} finally {
  await client.end()
}
