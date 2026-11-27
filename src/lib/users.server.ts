import { asc, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { account, club, user } from "@/db/schema"
import { auth } from "@/lib/auth"
import {
  listMemberClubIds,
  listMemberClubs,
  setMemberships,
} from "@/lib/club-members.server"
import type { MemberClub } from "@/lib/club-members.server"

// Pure data-access helpers for users (no auth). Kept in a server-only module so
// the Postgres driver (`pg`) never leaks into the client bundle. Used by the
// REST routes under src/routes/api/users (API-key/session via
// requireApiAccess). These helpers aren't scoped to a club — the route layer is
// responsible for authz.

export interface UserRecord {
  id: string
  name: string
  email: string
  role: string
  status: string
  // The clubs the user belongs to, default club first. Never empty.
  clubs: MemberClub[]
  createdAt: Date
}

export interface UserInput {
  name: string
  email: string
  role: string
  password: string
  clubIds?: string[]
}

export interface UserPatch {
  name?: string
  email?: string
  role?: string
  clubIds?: string[]
}

// The clubs a user ends up in: at least one existing club. Without `clubIds`,
// the user keeps `current`.
async function resolveClubIds(
  clubIds: string[] | undefined,
  current: string[]
): Promise<string[]> {
  const ids = clubIds !== undefined ? [...new Set(clubIds)] : current
  if (ids.length === 0) {
    throw new Error("A user needs at least one club.")
  }

  const found = await db
    .select({ id: club.id })
    .from(club)
    .where(inArray(club.id, ids))
  if (found.length !== ids.length) {
    throw new Error("One or more clubs were not found.")
  }
  return ids
}

async function hashPassword(password: string): Promise<string> {
  const ctx = await auth.$context
  return ctx.password.hash(password)
}

const baseSelect = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt,
}

async function withClubs(
  rows: Omit<UserRecord, "clubs">[]
): Promise<UserRecord[]> {
  const clubs = await listMemberClubs(rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, clubs: clubs.get(r.id) ?? [] }))
}

export async function listUserRecords(): Promise<UserRecord[]> {
  return withClubs(
    await db.select(baseSelect).from(user).orderBy(asc(user.createdAt))
  )
}

export async function getUserRecord(id: string): Promise<UserRecord | null> {
  const rows = await db
    .select(baseSelect)
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
  if (rows.length === 0) return null
  const [record] = await withClubs(rows)
  return record
}

export async function createUserRecord(data: UserInput): Promise<UserRecord> {
  const clubIds = await resolveClubIds(data.clubIds, [])

  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, data.email))
    .limit(1)
  if (existing.length > 0) {
    throw new Error("A user with this email already exists.")
  }

  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(user).values({
    id,
    name: data.name,
    email: data.email,
    role: data.role,
    status: "active",
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(data.password),
    createdAt: now,
    updatedAt: now,
  })
  await setMemberships(id, clubIds)

  const record = await getUserRecord(id)
  if (!record) throw new Error("User not found.")
  return record
}

export async function updateUserRecord(
  data: { id: string } & UserPatch
): Promise<UserRecord> {
  const current = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, data.id))
    .limit(1)
  if (current.length === 0) throw new Error("User not found.")

  if (data.email !== undefined) {
    const clash = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, data.email))
      .limit(1)
    if (clash.length > 0 && clash[0].id !== data.id) {
      throw new Error("A user with this email already exists.")
    }
  }

  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (data.name !== undefined) set.name = data.name
  if (data.email !== undefined) set.email = data.email
  if (data.role !== undefined) set.role = data.role

  // Recompute the user's clubs only when they change.
  if (data.clubIds !== undefined) {
    const clubIds = await resolveClubIds(
      data.clubIds,
      await listMemberClubIds(data.id)
    )
    await db.update(user).set(set).where(eq(user.id, data.id))
    await setMemberships(data.id, clubIds)
  } else {
    await db.update(user).set(set).where(eq(user.id, data.id))
  }

  const record = await getUserRecord(data.id)
  if (!record) throw new Error("User not found.")
  return record
}

export async function deleteUserRecord(id: string): Promise<{ id: string }> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
  if (rows.length === 0) throw new Error("User not found.")
  // FK cascades remove the user's account, sessions and memberships.
  await db.delete(user).where(eq(user.id, id))
  return { id }
}
