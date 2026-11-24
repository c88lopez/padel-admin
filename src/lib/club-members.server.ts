import { and, asc, eq, inArray, ne, notInArray } from "drizzle-orm"
import { db } from "@/db"
import { club, clubMember, user } from "@/db/schema"
import { SUPER_ADMIN_ROLE } from "@/lib/permissions"

// Data access for the clubs a user belongs to (club_member rows). A user's clubs
// are an ordered list: the earliest membership is their default club.

type Executor = Pick<typeof db, "select" | "delete">

export interface MemberClub {
  id: string
  name: string
}

const membershipOrder = [asc(clubMember.createdAt), asc(clubMember.clubId)]

/** The user's club ids, default club first. */
export async function listMemberClubIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ clubId: clubMember.clubId })
    .from(clubMember)
    .where(eq(clubMember.userId, userId))
    .orderBy(...membershipOrder)
  return rows.map((r) => r.clubId)
}

/** Each user's clubs, default club first. Users without clubs are left out. */
export async function listMemberClubs(
  userIds: string[]
): Promise<Map<string, MemberClub[]>> {
  const byUser = new Map<string, MemberClub[]>()
  if (userIds.length === 0) return byUser
  const rows = await db
    .select({ userId: clubMember.userId, id: club.id, name: club.name })
    .from(clubMember)
    .innerJoin(club, eq(club.id, clubMember.clubId))
    .where(inArray(clubMember.userId, userIds))
    .orderBy(...membershipOrder)
  for (const { userId, id, name } of rows) {
    const list = byUser.get(userId) ?? []
    list.push({ id, name })
    byUser.set(userId, list)
  }
  return byUser
}

/**
 * Makes `clubIds` the user's clubs. Clubs the user already belongs to keep
 * their place; new ones go after them in the given order, so on a user with no
 * clubs `clubIds[0]` becomes the default club.
 */
export async function setMemberships(
  userId: string,
  clubIds: string[]
): Promise<void> {
  const wanted = [...new Set(clubIds)]
  await db
    .delete(clubMember)
    .where(
      wanted.length > 0
        ? and(
            eq(clubMember.userId, userId),
            notInArray(clubMember.clubId, wanted)
          )
        : eq(clubMember.userId, userId)
    )
  if (wanted.length === 0) return
  const kept = new Set(await listMemberClubIds(userId))
  const added = wanted.filter((id) => !kept.has(id))
  // Spaced a millisecond apart so the order they were given in is the order
  // they sort in.
  const now = Date.now()
  if (added.length > 0) {
    await db.insert(clubMember).values(
      added.map((clubId, i) => ({
        userId,
        clubId,
        createdAt: new Date(now + i),
      }))
    )
  }
}

/**
 * Deletes the given users that no longer belong to any club, except
 * super-admins (who never do). Used after a club is deleted, since a club user
 * without a club can't do anything.
 */
export async function deleteUsersWithoutClubs(
  userIds: string[],
  executor: Executor = db
): Promise<void> {
  if (userIds.length === 0) return
  const stillMembers = executor
    .select({ userId: clubMember.userId })
    .from(clubMember)
    .where(inArray(clubMember.userId, userIds))
  await executor
    .delete(user)
    .where(
      and(
        inArray(user.id, userIds),
        notInArray(user.id, stillMembers),
        ne(user.role, SUPER_ADMIN_ROLE)
      )
    )
}
