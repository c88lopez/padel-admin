import { and, asc, count, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/db"
import { coachClass, reservation, space } from "@/db/schema"
import { AppError } from "@/lib/errors"
import {
  listActivityRecords,
  primaryActivityFor,
} from "@/lib/activities.server"
import type { ActivityRecord } from "@/lib/activities.server"
import { activityProvides, getTemplate } from "@/lib/activities/templates"
import type { BlockKey } from "@/lib/activities/templates"
import { defaultSpaceName } from "@/lib/activities/spaces"

// Pure data-access helpers for spaces (no auth). Kept in a server-only module so
// the Postgres driver (`pg`) never leaks into the client bundle. Shared by the
// TanStack server functions in spaces.functions.ts (which add session/permission
// checks) and by club provisioning/seeding.

export interface SpaceRecord {
  id: string
  name: string
  // The kind of space (src/lib/activities/spaces.ts): "court", "studio", …
  type: string
  indoor: boolean
  active: boolean
  // Numbered per activity: Court 1–6 and Studio 1 can coexist.
  sortOrder: number
  activityId: string | null
}

export interface CreateSpaceInput {
  activityId: string
  // Defaults to the activity's first allowed type.
  type?: string
  indoor: boolean
  active: boolean
}

export interface UpdateSpaceInput {
  id: string
  name?: string
  type?: string
  indoor?: boolean
  active?: boolean
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

// The activity unassigned (pre-activity) spaces belong to.
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

/** Ids of the club's active activities that provide a block. */
export async function activityIdsProviding(
  clubId: string,
  block: BlockKey
): Promise<string[]> {
  return (await listActivityRecords(clubId))
    .filter((a) => activityProvides(a, block))
    .map((a) => a.id)
}

// The club's activity, which must have spaces at all.
async function activityWithSpaces(
  clubId: string,
  activityId: string
): Promise<ActivityRecord> {
  const found = (await listActivityRecords(clubId)).find(
    (a) => a.id === activityId
  )
  if (!found || !getTemplate(found.templateKey)?.spaces) {
    throw new AppError("errors.activity.notFound")
  }
  return found
}

function assertTypeAllowed(activity: ActivityRecord, type: string): void {
  const allowed: readonly string[] =
    getTemplate(activity.templateKey)?.spaces?.types ?? []
  if (!allowed.includes(type)) throw new AppError("errors.space.wrongType")
}

// Next number within the activity, so new spaces append ("Court 7").
async function nextSortOrder(
  clubId: string,
  activityId: string
): Promise<number> {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${space.sortOrder}), 0)::int` })
    .from(space)
    .where(and(eq(space.clubId, clubId), eq(space.activityId, activityId)))
  return max + 1
}

export async function createSpaceRecord(
  clubId: string,
  data: CreateSpaceInput
): Promise<SpaceRecord> {
  const activity = await activityWithSpaces(clubId, data.activityId)
  const type =
    data.type ?? getTemplate(activity.templateKey)?.spaces?.types[0] ?? ""
  assertTypeAllowed(activity, type)
  const sortOrder = await nextSortOrder(clubId, activity.id)
  const [created] = await db
    .insert(space)
    .values({
      clubId,
      activityId: activity.id,
      type,
      name: defaultSpaceName(type, sortOrder),
      indoor: data.indoor,
      active: data.active,
      sortOrder,
    })
    .returning()
  return toRecord(created)
}

export async function updateSpaceRecord(
  clubId: string,
  data: UpdateSpaceInput
): Promise<SpaceRecord> {
  const set: Omit<UpdateSpaceInput, "id"> = {}
  if (data.name !== undefined) set.name = data.name
  if (data.indoor !== undefined) set.indoor = data.indoor
  if (data.active !== undefined) set.active = data.active
  if (data.type !== undefined) {
    const rows = await db
      .select({ activityId: space.activityId })
      .from(space)
      .where(and(eq(space.id, data.id), eq(space.clubId, clubId)))
      .limit(1)
    const current = rows.at(0)
    if (!current?.activityId) throw new Error("Space not found.")
    assertTypeAllowed(
      await activityWithSpaces(clubId, current.activityId),
      data.type
    )
    set.type = data.type
  }
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

/**
 * Ensures a space exists in this club, is active, and belongs to an active
 * activity that provides the block it's used for (a reservation needs
 * "bookings", a class "sessions"). Throws otherwise. Used by reservation and
 * class writes before persisting.
 */
export async function assertSpaceBookable(
  clubId: string,
  spaceId: string,
  block: BlockKey
): Promise<void> {
  const rows = await db
    .select({ active: space.active, activityId: space.activityId })
    .from(space)
    .where(and(eq(space.id, spaceId), eq(space.clubId, clubId)))
    .limit(1)
  const row = rows.at(0)
  if (!row) throw new AppError("errors.space.gone")
  if (!row.active) throw new AppError("errors.space.inactive")
  // Spaces from before activities belong to the bookings activity, which
  // linkUnassignedSpaces sets on the next read.
  const activityId = row.activityId ?? (await bookingsActivityId(clubId))
  const activity = (await listActivityRecords(clubId)).find(
    (a) => a.id === activityId
  )
  if (!activityProvides(activity, block)) {
    throw new AppError("errors.space.wrongActivity")
  }
}

/**
 * Gives an activity its default spaces (e.g. six padel courts, one pilates
 * studio) when it has none. Runs when a club gets the activity: on club
 * creation and seeding, and when the app's owners first enable it.
 */
export async function seedActivitySpaces(
  clubId: string,
  activityId: string
): Promise<void> {
  const activity = await activityWithSpaces(clubId, activityId)
  const spaces = getTemplate(activity.templateKey)?.spaces
  if (!spaces) return
  // Pre-activity spaces count as the bookings activity's own.
  await linkUnassignedSpaces(clubId)
  const existing = await db
    .select({ id: space.id })
    .from(space)
    .where(and(eq(space.clubId, clubId), eq(space.activityId, activityId)))
    .limit(1)
  if (existing.length > 0) return
  const [type] = spaces.types
  await db.insert(space).values(
    Array.from({ length: spaces.defaultCount }, (_, i) => ({
      clubId,
      activityId,
      type,
      name: defaultSpaceName(type, i + 1),
      indoor: true,
      active: true,
      sortOrder: i + 1,
    }))
  )
}

/** Default spaces for every activity of a new club (see seedActivitySpaces). */
export async function seedDefaultSpaces(clubId: string): Promise<void> {
  for (const activity of await listActivityRecords(clubId)) {
    if (getTemplate(activity.templateKey)?.spaces) {
      await seedActivitySpaces(clubId, activity.id)
    }
  }
}
