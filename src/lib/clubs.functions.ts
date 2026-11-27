import { createServerFn } from "@tanstack/react-start"
import { setCookie } from "@tanstack/react-start/server"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { club, clubMember } from "@/db/schema"
import {
  ACTIVE_CLUB_COOKIE,
  requirePermission,
  requireSession,
  resolveActiveClubId,
} from "@/lib/auth.server"
import { listMemberClubIds } from "@/lib/club-members.server"
import { AppError } from "@/lib/errors"
import { listActivityRecords } from "@/lib/activities.server"
import type { ActivitySummary } from "@/lib/activities/templates"

// Clubs are created, renamed and deleted only through the hidden platform API
// (src/routes/api/platform/clubs). These functions cover what a club's own
// users do: pick which of their clubs to act in, and rename the active one.

// Clubs available for assignment in the user drawer: the active clubs the
// caller belongs to, since a manager can only hand out their own clubs
// (users.functions enforces it).
export const listClubOptions = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await requirePermission("users:manage")
    return db
      .select({ id: club.id, name: club.name })
      .from(clubMember)
      .innerJoin(club, eq(club.id, clubMember.clubId))
      .where(
        and(eq(clubMember.userId, session.user.id), eq(club.status, "active"))
      )
      .orderBy(asc(club.name))
  }
)

// Renames the caller's currently active club, so a club's own Owner/Admin can
// edit their club profile from Settings → General. Scoped to the active club so
// it can't touch other clubs.
export const renameActiveClub = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ name: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) => {
    const session = await requirePermission("settings:manage")
    const clubId = await resolveActiveClubId(session.user)
    if (!clubId)
      throw new AppError(
        "errors.club.noActiveToRename",
        "No hay un club activo para renombrar."
      )
    const name = data.name.trim()
    if (!name)
      throw new AppError(
        "errors.club.nameRequired",
        "El nombre del club es obligatorio."
      )
    await db.update(club).set({ name }).where(eq(club.id, clubId))
    return { id: clubId, name }
  })

export interface ClubContext {
  activeClubId: string | null
  activeClubName: string | null
  clubs: { id: string; name: string }[]
  // The active club's activities; drives which sections the navigation shows.
  activities: ActivitySummary[]
}

// Club context for the sidebar club switcher: the clubs the user is a member
// of, so an Owner who belongs to several clubs can switch between them. The
// active club is always one of them.
export const getClubContext = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClubContext> => {
    const session = await requireSession()
    const activeClubId = await resolveActiveClubId(session.user)
    const clubs = await db
      .select({ id: club.id, name: club.name })
      .from(clubMember)
      .innerJoin(club, eq(club.id, clubMember.clubId))
      .where(eq(clubMember.userId, session.user.id))
      .orderBy(asc(club.name))
    const activeClubName =
      clubs.find((c) => c.id === activeClubId)?.name ?? null
    const activities = activeClubId
      ? (await listActivityRecords(activeClubId)).map(
          ({ id, templateKey, name, active }) => ({
            id,
            templateKey,
            name,
            active,
          })
        )
      : []
    return { activeClubId, activeClubName, clubs, activities }
  }
)

// Selects which club to act as, among the clubs the user belongs to. Persists in
// an http-only cookie.
export const setActiveClub = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ clubId: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    if (!(await listMemberClubIds(session.user.id)).includes(data.clubId)) {
      throw new AppError("errors.club.noAccess", "No tienes acceso a ese club.")
    }

    setCookie(ACTIVE_CLUB_COOKIE, data.clubId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    })
    return { clubId: data.clubId }
  })
