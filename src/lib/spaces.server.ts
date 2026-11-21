import { and, asc, count, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/db"
import { coachClass, reservation, space } from "@/db/schema"
import { AppError } from "@/lib/errors"
import { primaryActivityFor } from "@/lib/activities.server"

// Pure data-access helpers for spaces (no auth). Kept in a server-only module so
// the Postgres driver (`pg`) never leaks into the client bundle. Shared by the
// TanStack server functions in spaces.functions.ts (which add session/permission
// checks) and by club provisioning/seeding.

export interface SpaceRecord {
  id: string
  name: string
  // The kind of space ("court", later "studio", "field", …).
  type: string
  indoor: boolean
  active: boolean
  sortOrder: number
  activityId: string | null
}

export interface SpaceInput {
  name: string
  indoor: boolean
  active: boolean
}

const spaceColumns = {
  id: space.id,
  name: space.name,
  type: space.type,
  indoor: space.indoor,
  active: space.active,
  sortOrder: space.sortOrder,
  activityId: space.activityId,
}

function toRecord(row: SpaceRecord): SpaceRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    indoor: row.indoor,
    active: row.active,
    sortOrder: row.sortOrder,
    activityId: row.activityId,
  }
}

// The activity new and unassigned spaces belong to while the UI manages a
// single bookings activity.
async function bookingsActivityId(clubId: string): Promise<string | null> {
  return (await primaryActivityFor(clubId, "bookings"))?.id ?? null
}

/**
 * Idempotent: links spaces without an activity to the club's bookings
 * activity. Covers databases baselined without running migration 0012's
 * backfill.
 */
export async function linkUnassignedSpaces(clubId: string): Promise<void> {
  const activityId = await bookingsActivityId(clubId)
  if (!activityId) return
  await db
    .update(space)
    .set({ activityId })
    .where(and(eq(space.clubId, clubId), isNull(space.activityId)))
}

export async function listSpaceRecords(clubId: string): Promise<SpaceRecord[]> {
  await linkUnassignedSpaces(clubId)
  const rows = await db
    .select(spaceColumns)
    .from(space)
    .where(eq(space.clubId, clubId))
    .orderBy(asc(space.sortOrder), asc(space.name))
  return rows.map(toRecord)
}

export async function createSpaceRecord(
  clubId: string,
  data: SpaceInput
): Promise<SpaceRecord> {
  // Next space number = current max sort order + 1, so new spaces append.
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${space.sortOrder}), 0)::int` })
    .from(space)
    .where(eq(space.clubId, clubId))
  const [created] = await db
    .insert(space)
    .values({
      clubId,
      name: data.name,
      indoor: data.indoor,
      active: data.active,
      sortOrder: max + 1,
      activityId: await bookingsActivityId(clubId),
    })
    .returning()
  return toRecord(created)
}

export async function updateSpaceRecord(
  clubId: string,
  data: { id: string } & Partial<SpaceInput>
): Promise<SpaceRecord> {
  const set: Partial<SpaceInput> = {}
  if (data.name !== undefined) set.name = data.name
  if (data.indoor !== undefined) set.indoor = data.indoor
  if (data.active !== undefined) set.active = data.active
  const updated = await db
    .update(space)
    .set(set)
    .where(and(eq(space.id, data.id), eq(space.clubId, clubId)))
    .returning()
  if (updated.length === 0) throw new Error("Space not found.")
  return toRecord(updated[0])
}

export interface SpaceUsage {
  reservations: number
  classes: number
}

// How many reservations / classes still reference a space — used to block
// deleting a space that's in use.
export async function countSpaceUsageRecord(
  clubId: string,
  spaceId: string
): Promise<SpaceUsage> {
  const [res] = await db
    .select({ value: count() })
    .from(reservation)
    .where(
      and(eq(reservation.clubId, clubId), eq(reservation.spaceId, spaceId))
    )
  const [cls] = await db
    .select({ value: count() })
    .from(coachClass)
    .where(and(eq(coachClass.clubId, clubId), eq(coachClass.spaceId, spaceId)))
  return { reservations: res.value, classes: cls.value }
}

export async function deleteSpaceRecord(
  clubId: string,
  spaceId: string
): Promise<{ id: string }> {
  const usage = await countSpaceUsageRecord(clubId, spaceId)
  if (usage.reservations > 0 || usage.classes > 0) {
    throw new Error("SPACE_IN_USE")
  }
  await db
    .delete(space)
    .where(and(eq(space.id, spaceId), eq(space.clubId, clubId)))
  return { id: spaceId }
}

// Ensures a space exists in this club and is bookable. Throws otherwise. Used
// by reservation and class writes before persisting.
export async function assertSpaceBookable(
  clubId: string,
  spaceId: string
): Promise<void> {
  const rows = await db
    .select({ active: space.active })
    .from(space)
    .where(and(eq(space.id, spaceId), eq(space.clubId, clubId)))
    .limit(1)
  if (rows.length === 0) {
    throw new AppError("errors.space.gone")
  }
  if (!rows[0].active) {
    throw new AppError("errors.space.inactive")
  }
}

// Creates a default set of numbered courts for a club's padel activity. Used
// when provisioning a new club and when seeding. Idempotent-ish: skips if the
// club already has any space.
export async function seedDefaultSpaces(
  clubId: string,
  countOf = 6
): Promise<void> {
  const existing = await db
    .select({ id: space.id })
    .from(space)
    .where(eq(space.clubId, clubId))
    .limit(1)
  if (existing.length > 0) return
  const activityId = await bookingsActivityId(clubId)
  await db.insert(space).values(
    Array.from({ length: countOf }, (_, i) => ({
      clubId,
      name: `Court ${i + 1}`,
      type: "court",
      indoor: true,
      active: true,
      sortOrder: i + 1,
      activityId,
    }))
  )
}
