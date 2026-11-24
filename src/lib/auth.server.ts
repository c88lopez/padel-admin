import { getCookie, getRequest } from "@tanstack/react-start/server"
import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { club } from "@/db/schema"
import { auth } from "@/lib/auth"
import { chooseActiveClub } from "@/lib/active-club"
import { listMemberClubIds } from "@/lib/club-members.server"
import { can, SUPER_ADMIN_ROLE } from "@/lib/permissions"
import type { Permission } from "@/lib/permissions"
import { AppError } from "@/lib/errors"

// Cookie that records which club the user is currently acting as. Club users
// can only pick clubs they belong to.
export const ACTIVE_CLUB_COOKIE = "active_club_id"

// Server-only auth helpers. Lives in a `.server.ts` module so the server-only
// imports never reach a client bundle — only call these from inside server
// function handlers.

/**
 * Guards a server function: throws if there is no authenticated session, or if
 * the account has since been archived.
 */
export async function requireSession() {
  const { headers } = getRequest()
  const session = await auth.api.getSession({ headers })
  if (!session || session.user.status === "archived") {
    throw new AppError("errors.unauthorized")
  }
  return session
}

/**
 * Guards a server function: requires an authenticated session whose role is
 * allowed to perform the given action. Throws otherwise.
 */
export async function requirePermission(permission: Permission) {
  const session = await requireSession()
  if (!can(session.user.role, permission)) {
    throw new AppError("errors.forbidden")
  }
  return session
}

/**
 * Resolves the club the current request acts within:
 * - club users: the club chosen via the active-club cookie when they belong to
 *   it, otherwise their default club (their first). Null when they belong to
 *   none, so a club user never falls through to the super-admin scope below.
 * - super-admins: the club chosen via the active-club cookie, falling back to
 *   the first club alphabetically so every page has a concrete scope.
 */
export async function resolveActiveClubId(user: {
  id: string
  role?: string | null
}): Promise<string | null> {
  const selected = getCookie(ACTIVE_CLUB_COOKIE)
  if (user.role !== SUPER_ADMIN_ROLE) {
    return chooseActiveClub(await listMemberClubIds(user.id), selected)
  }
  if (selected) {
    const rows = await db
      .select({ id: club.id })
      .from(club)
      .where(eq(club.id, selected))
      .limit(1)
    if (rows.length > 0) return rows[0].id
  }
  const first = await db
    .select({ id: club.id })
    .from(club)
    .orderBy(asc(club.name))
    .limit(1)
  return first[0]?.id ?? null
}

/**
 * The active club for the current authenticated request. Throws if no club is
 * available. Use for scoping reads.
 */
export async function currentClubId(): Promise<string> {
  const session = await requireSession()
  const clubId = await resolveActiveClubId(session.user)
  if (!clubId) throw new AppError("errors.noClub")
  return clubId
}

/**
 * Guards a club-scoped write: requires the permission and a concrete active
 * club. Returns the active club id to stamp/scope the mutation.
 */
export async function requireClubId(permission: Permission): Promise<string> {
  const session = await requirePermission(permission)
  const clubId = await resolveActiveClubId(session.user)
  if (!clubId) {
    throw new AppError("errors.clubContextRequired")
  }
  return clubId
}
