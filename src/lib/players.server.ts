import { and, asc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { customerActivityProfile, player } from "@/db/schema"
import { primaryActivityFor } from "@/lib/activities.server"

// Data access for players (the club's customers; no auth). Server-only so the
// Postgres driver stays out of the client bundle. Wrapped by
// players.functions.ts and reused by reservations and the AI tools.
//
// A player's level is activity-specific and lives in
// customer_activity_profile. While the UI shows a single level, it is the
// level for the club's primary "levels" activity (padel), exposed as
// `category`.

export interface PlayerData {
  fullName: string
  email: string
  phone: string
  age: number
  gender: "Male" | "Female"
  category: string
}

export type PlayerRecord = typeof player.$inferSelect & {
  category: string | null
}

export async function levelsActivityId(clubId: string): Promise<string | undefined> {
  return (await primaryActivityFor(clubId, "levels"))?.id
}

async function saveLevel(
  clubId: string,
  customerId: string,
  level: string
): Promise<void> {
  const activityId = await levelsActivityId(clubId)
  if (!activityId) return
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

export async function listPlayerRecords(
  clubId: string
): Promise<PlayerRecord[]> {
  const activityId = (await levelsActivityId(clubId)) ?? null
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
        sql`${customerActivityProfile.activityId} = ${activityId}`
      )
    )
    .where(eq(player.clubId, clubId))
    .orderBy(asc(player.fullName))
  return rows.map(({ row, level }) => ({ ...row, category: level }))
}

export async function createPlayerRecord(
  clubId: string,
  data: PlayerData
): Promise<PlayerRecord> {
  const { category, ...values } = data
  const [created] = await db
    .insert(player)
    .values({ ...values, clubId })
    .returning()
  await saveLevel(clubId, created.id, category)
  return { ...created, category }
}

export async function updatePlayerRecord(
  clubId: string,
  data: { id: string } & PlayerData
): Promise<PlayerRecord | undefined> {
  const { id, category, ...values } = data
  const rows = await db
    .update(player)
    .set(values)
    .where(and(eq(player.id, id), eq(player.clubId, clubId)))
    .returning()
  const updated = rows.at(0)
  if (!updated) return undefined
  await saveLevel(clubId, updated.id, category)
  return { ...updated, category }
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
