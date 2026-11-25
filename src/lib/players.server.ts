import { and, asc, count, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import type { Tx } from "@/db"
import { customerActivityProfile, player } from "@/db/schema"
import {
  defaultCustomerActivity,
  primaryActivityFor,
  requireActiveActivity,
} from "@/lib/activities.server"
import { activityProvides } from "@/lib/activities/templates"
import { AppError } from "@/lib/errors"

// Data access for players (the club's customers; no auth). Server-only so the
// Postgres driver stays out of the client bundle. Wrapped by
// players.functions.ts and reused by reservations and the AI tools.
//
// A customer belongs to an activity when they have a customer_activity_profile
// row for it (padel players, pilates students); one person can be in several.
// The row also holds the activity's level, exposed as `category`. Calls that
// name no activity use the club's default (see defaultCustomerActivity).

export interface PlayerData {
  fullName: string
  email: string
  phone: string
  age: number
  gender: "Male" | "Female"
  // The level, for activities that have levels; ignored otherwise.
  category: string | null
}

export type PlayerRecord = typeof player.$inferSelect & {
  category: string | null
}

export async function levelsActivityId(
  clubId: string
): Promise<string | undefined> {
  return (await primaryActivityFor(clubId, "levels"))?.id
}

interface Membership {
  activityId: string
  level: string | null
}

// The activity a save puts the customer in, and the level to store there.
// Resolved before writing so a bad activity or missing level saves nothing.
async function resolveMembership(
  clubId: string,
  activityId: string | undefined,
  level: string | null
): Promise<Membership | undefined> {
  const target = activityId
    ? await requireActiveActivity(clubId, activityId)
    : await defaultCustomerActivity(clubId)
  if (!target) return undefined
  const hasLevels = activityProvides(target, "levels")
  if (hasLevels && !level)
    throw new AppError(
      "errors.activity.levelRequired",
      "Elige un nivel para esta actividad."
    )
  return { activityId: target.id, level: hasLevels ? level : null }
}

async function saveMembership(
  clubId: string,
  customerId: string,
  { activityId, level }: Membership
): Promise<void> {
  await db
    .insert(customerActivityProfile)
    .values({ clubId, customerId, activityId, level })
    .onConflictDoUpdate({
      target: [
        customerActivityProfile.customerId,
        customerActivityProfile.activityId,
      ],
      set: { level },
    })
}

/** Puts a customer in an activity, keeping any level they already have. */
export async function joinActivity(
  tx: Tx,
  clubId: string,
  customerId: string,
  activityId: string
): Promise<void> {
  await tx
    .insert(customerActivityProfile)
    .values({ clubId, customerId, activityId })
    .onConflictDoNothing()
}

/**
 * The customers of one activity, with their level in it; or, without an
 * activity, every customer in the club with their level in the levels
 * activity (e.g. to pick a class attendee).
 */
export async function listPlayerRecords(
  clubId: string,
  activityId?: string
): Promise<PlayerRecord[]> {
  if (activityId) {
    const rows = await db
      .select({ row: player, level: customerActivityProfile.level })
      .from(player)
      .innerJoin(
        customerActivityProfile,
        and(
          eq(customerActivityProfile.customerId, player.id),
          eq(customerActivityProfile.activityId, activityId)
        )
      )
      .where(eq(player.clubId, clubId))
      .orderBy(asc(player.fullName))
    return rows.map(({ row, level }) => ({ ...row, category: level }))
  }
  const levelsId = (await levelsActivityId(clubId)) ?? null
  const rows = await db
    .select({
      row: player,
      level: customerActivityProfile.level,
    })
    .from(player)
    .leftJoin(
      customerActivityProfile,
      and(
        eq(customerActivityProfile.customerId, player.id),
        sql`${customerActivityProfile.activityId} = ${levelsId}`
      )
    )
    .where(eq(player.clubId, clubId))
    .orderBy(asc(player.fullName))
  return rows.map(({ row, level }) => ({ ...row, category: level }))
}

export async function createPlayerRecord(
  clubId: string,
  data: PlayerData,
  activityId?: string
): Promise<PlayerRecord> {
  const { category, ...values } = data
  const membership = await resolveMembership(clubId, activityId, category)
  const [created] = await db
    .insert(player)
    .values({ ...values, clubId })
    .returning()
  if (membership) await saveMembership(clubId, created.id, membership)
  return { ...created, category: membership?.level ?? null }
}

export async function updatePlayerRecord(
  clubId: string,
  data: { id: string } & PlayerData,
  activityId?: string
): Promise<PlayerRecord | undefined> {
  const { id, category, ...values } = data
  const membership = await resolveMembership(clubId, activityId, category)
  const rows = await db
    .update(player)
    .set(values)
    .where(and(eq(player.id, id), eq(player.clubId, clubId)))
    .returning()
  const updated = rows.at(0)
  if (!updated) return undefined
  if (membership) await saveMembership(clubId, updated.id, membership)
  return { ...updated, category: membership?.level ?? null }
}

export async function deletePlayerRecord(
  clubId: string,
  id: string
): Promise<{ id: string }> {
  await db
    .delete(player)
    .where(and(eq(player.id, id), eq(player.clubId, clubId)))
  return { id }
}

/**
 * Takes a customer out of one activity's list. Someone left in no activity is
 * deleted, as deletePlayerRecord does.
 */
export async function removePlayerFromActivity(
  clubId: string,
  id: string,
  activityId: string
): Promise<{ id: string; deleted: boolean }> {
  return db.transaction(async (tx) => {
    await tx
      .delete(customerActivityProfile)
      .where(
        and(
          eq(customerActivityProfile.customerId, id),
          eq(customerActivityProfile.activityId, activityId),
          eq(customerActivityProfile.clubId, clubId)
        )
      )
    const [{ value }] = await tx
      .select({ value: count() })
      .from(customerActivityProfile)
      .where(eq(customerActivityProfile.customerId, id))
    if (value > 0) return { id, deleted: false }
    await tx
      .delete(player)
      .where(and(eq(player.id, id), eq(player.clubId, clubId)))
    return { id, deleted: true }
  })
}

/**
 * The customer a free-text booking name refers to: an exact match on the full
 * name (ignoring case and surrounding spaces) that identifies exactly one
 * player in the club. Ambiguous or unknown names return null.
 */
export async function findCustomerIdByName(
  clubId: string,
  name: string
): Promise<string | null> {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return null
  const matches = await db
    .select({ id: player.id })
    .from(player)
    .where(
      and(
        eq(player.clubId, clubId),
        sql`lower(trim(${player.fullName})) = ${normalized}`
      )
    )
    .limit(2)
  return matches.length === 1 ? matches[0].id : null
}
