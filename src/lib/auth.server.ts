import { getCookie, getRequest } from "@tanstack/react-start/server"
import { setRequestClub } from "@/db/tenant"
import { auth } from "@/lib/auth"
import { chooseActiveClub } from "@/lib/active-club"
import { listMemberClubIds } from "@/lib/club-members.server"
import { can } from "@/lib/permissions"
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
    throw new AppError("errors.unauthorized", "No autorizado")
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
    throw new AppError("errors.forbidden", "Acceso denegado")
  }
  return session
}

/**
 * Resolves the club the current request acts within: the club chosen via the
 * active-club cookie when the user belongs to it, otherwise their default club
 * (their first). Null when they belong to none, so every page fails closed.
 *
 * Also scopes the rest of the request to that club for row-level security
 * (src/db/tenant.ts): club-scoped tables only show its rows from here on.
 */
export async function resolveActiveClubId(user: {
  id: string
}): Promise<string | null> {
  const clubId = chooseActiveClub(
    await listMemberClubIds(user.id),
    getCookie(ACTIVE_CLUB_COOKIE)
  )
  if (clubId) setRequestClub(clubId)
  return clubId
}

/**
 * The active club for the current authenticated request. Throws if no club is
 * available. Use for scoping reads.
 */
export async function currentClubId(): Promise<string> {
  const session = await requireSession()
  const clubId = await resolveActiveClubId(session.user)
  if (!clubId)
    throw new AppError(
      "errors.noClub",
      "No hay ningún club disponible para esta cuenta."
    )
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
    throw new AppError(
      "errors.clubContextRequired",
      "Esta acción requiere un club activo."
    )
  }
  return clubId
}
