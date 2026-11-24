import { AsyncLocalStorage } from "node:async_hooks"
import { sql } from "drizzle-orm"
import type { SQL } from "drizzle-orm"
import type { Pool, PoolClient } from "pg"

// Row-level security context (see drizzle/CLAUDE.md). Every club-scoped table
// has a policy that only shows rows whose club_id equals the `app.club_id`
// setting, unless `app.bypass_rls` is on. Both are set per transaction
// (set_config(..., true)), never per session: the app reaches Postgres through
// PgBouncer in transaction mode, where a session setting would leak to other
// clients. With no scope, club-scoped tables look empty and writes to them
// fail, so a forgotten scope fails closed.

export type TenantScope = { clubId: string } | { bypass: true }

interface ScopeHolder {
  scope?: TenantScope
}

const storage = new AsyncLocalStorage<ScopeHolder>()

// For scripts and tests that act on every club (seed, reset); see
// bypassRlsForProcess. Never set in the app server.
let processScope: TenantScope | undefined

export function currentScope(): TenantScope | undefined {
  return storage.getStore()?.scope ?? processScope
}

/**
 * Runs `fn` with an empty scope that `setRequestClub` fills in once the
 * request's club is known. Wraps every request (tenant-scope-middleware.ts).
 */
export function runRequest<T>(fn: () => T): T {
  return storage.run({}, fn)
}

/**
 * Scopes the rest of the current request to a club. Called by
 * resolveActiveClubId, the one place a request's club is decided. Outside a
 * request it does nothing.
 */
export function setRequestClub(clubId: string): void {
  const holder = storage.getStore()
  if (holder) holder.scope = { clubId }
}

/**
 * Runs `fn` as the given club, whatever club the request is in: for work on a
 * club named explicitly (creating a club, the platform API), and for work that
 * outlives the request's async context (the AI tools, while streaming).
 */
export function withClubScope<T>(clubId: string, fn: () => PromiseLike<T>) {
  return runScoped({ clubId }, fn)
}

/** Runs `fn` seeing every club's rows. Scripts and tests only. */
export function withRlsBypass<T>(fn: () => PromiseLike<T>) {
  return runScoped({ bypass: true }, fn)
}

// Awaits inside the scope: drizzle's query builders are lazy thenables, so
// `withClubScope(id, () => db.select()...)` would otherwise run the query when
// the caller awaits it, outside the scope.
function runScoped<T>(scope: TenantScope, fn: () => PromiseLike<T>) {
  return storage.run({ scope }, async () => await fn())
}

/** Makes the whole process see every club's rows. Scripts and tests only. */
export function bypassRlsForProcess(): void {
  processScope = { bypass: true }
}

/** The statement that applies `scope` to the current transaction. */
export function scopeStatement(scope: TenantScope): SQL {
  return "clubId" in scope
    ? sql`select set_config('app.club_id', ${scope.clubId}, true)`
    : sql`select set_config('app.bypass_rls', 'on', true)`
}

// The same, inlined, so it can share one round trip with BEGIN (a
// multi-statement query can't take parameters).
function inlineScopeStatement(client: PoolClient, scope: TenantScope): string {
  return "clubId" in scope
    ? `SELECT set_config('app.club_id', ${client.escapeLiteral(scope.clubId)}, true)`
    : "SELECT set_config('app.bypass_rls', 'on', true)"
}

type QueryFn = (...args: unknown[]) => Promise<unknown>

async function scopedQuery(pool: Pool, scope: TenantScope, args: unknown[]) {
  const client = await pool.connect()
  try {
    await client.query(`BEGIN; ${inlineScopeStatement(client, scope)}`)
    const result = await (client.query as QueryFn)(...args)
    await client.query("COMMIT")
    client.release()
    return result
  } catch (error) {
    await client.query("ROLLBACK").then(
      () => client.release(),
      (rollbackError: Error) => client.release(rollbackError)
    )
    throw error
  }
}

/**
 * Makes `pool.query` (what drizzle uses outside a transaction) run each query
 * in its own transaction with the current scope applied. Queries with no scope,
 * or in the callback style, go through unchanged.
 */
export function scopePoolQueries(pool: Pool): void {
  const query = pool.query.bind(pool) as QueryFn
  pool.query = ((...args: unknown[]) => {
    const scope = currentScope()
    if (!scope || typeof args.at(-1) === "function") return query(...args)
    return scopedQuery(pool, scope, args)
  }) as typeof pool.query
}
