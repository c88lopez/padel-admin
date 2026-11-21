import { and, asc, count, eq, max, ne } from "drizzle-orm"
import { db } from "@/db"
import { activity } from "@/db/schema"
import { AppError } from "@/lib/errors"
import {
  DEFAULT_TEMPLATE_KEY,
  enableRefusal,
  getTemplate,
  primaryActivity,
} from "@/lib/activities/templates"
import type {
  ActivityConfig,
  ActivitySummary,
  BlockKey,
} from "@/lib/activities/templates"
import { resolveActivityConfig } from "@/lib/activities/config"

// Data access for a club's activities (no auth). Server-only so the Postgres
// driver stays out of the client bundle; wrapped by activities.functions.ts and
// used by club provisioning/seeding.

export interface ActivityRecord extends ActivitySummary {
  sortOrder: number
  config: ActivityConfig
}

/**
 * Idempotent: gives a club the default activity when it has none. Runs on club
 * creation and lazily on reads, which also covers databases that were
 * baselined without running migration 0011's backfill.
 */
export async function ensureDefaultActivities(clubId: string): Promise<void> {
  const existing = await db
    .select({ id: activity.id })
    .from(activity)
    .where(eq(activity.clubId, clubId))
    .limit(1)
  if (existing.length > 0) return
  await db
    .insert(activity)
    .values({ clubId, templateKey: DEFAULT_TEMPLATE_KEY })
    .onConflictDoNothing()
}

function toRecord(row: typeof activity.$inferSelect): ActivityRecord | null {
  const template = getTemplate(row.templateKey)
  // Rows for templates this build doesn't know (e.g. written by a newer
  // version) are skipped rather than breaking the app.
  if (!template) return null
  return {
    id: row.id,
    templateKey: row.templateKey,
    name: row.name,
    active: row.active,
    sortOrder: row.sortOrder,
    config: resolveActivityConfig(template, row.config),
  }
}

export async function listActivityRecords(
  clubId: string
): Promise<ActivityRecord[]> {
  await ensureDefaultActivities(clubId)
  const rows = await db
    .select()
    .from(activity)
    .where(eq(activity.clubId, clubId))
    .orderBy(asc(activity.sortOrder), asc(activity.createdAt))
  return rows.flatMap((row) => toRecord(row) ?? [])
}

/** The club's activity that provides a building block (see primaryActivity). */
export async function primaryActivityFor(
  clubId: string,
  block: BlockKey
): Promise<ActivityRecord | undefined> {
  return primaryActivity(await listActivityRecords(clubId), block)
}

/** Renames an activity; an empty name falls back to the template's name. */
export async function renameActivityRecord(
  clubId: string,
  data: { id: string; name: string | null }
): Promise<ActivityRecord> {
  const rows = await db
    .update(activity)
    .set({ name: data.name?.trim() || null })
    .where(and(eq(activity.id, data.id), eq(activity.clubId, clubId)))
    .returning()
  const updated = rows.at(0)
  const record = updated ? toRecord(updated) : null
  if (!record) throw new AppError("errors.activity.notFound")
  return record
}

export type SetActivityEnabledResult =
  // `created`: this call gave the club the activity for the first time.
  | { ok: true; activity: ActivityRecord; created: boolean }
  | {
      ok: false
      reason: "unknownTemplate" | "unavailable" | "notFound" | "lastActive"
    }

/**
 * Enables or disables a template for a club, creating the activity on first
 * enable. Reserved for the app's owners (see the platform API); clubs can't
 * change which activities they have. Returns a reason instead of throwing so
 * callers can map it to their own error model.
 */
export async function setActivityEnabled(
  clubId: string,
  templateKey: string,
  active: boolean
): Promise<SetActivityEnabledResult> {
  const refusal = enableRefusal(getTemplate(templateKey), active)
  if (refusal) return { ok: false, reason: refusal }

  await ensureDefaultActivities(clubId)
  const rows = await db
    .select()
    .from(activity)
    .where(
      and(eq(activity.clubId, clubId), eq(activity.templateKey, templateKey))
    )
    .limit(1)
  let row = rows.at(0)
  const created = !row

  if (!row) {
    if (!active) return { ok: false, reason: "notFound" }
    const [{ next }] = await db
      .select({ next: max(activity.sortOrder) })
      .from(activity)
      .where(eq(activity.clubId, clubId))
    ;[row] = await db
      .insert(activity)
      .values({ clubId, templateKey, sortOrder: (next ?? -1) + 1 })
      .returning()
  } else if (row.active !== active) {
    // A club must keep at least one active activity, or there is nothing left
    // to book or schedule.
    if (!active) {
      const [others] = await db
        .select({ n: count() })
        .from(activity)
        .where(
          and(
            eq(activity.clubId, clubId),
            eq(activity.active, true),
            ne(activity.id, row.id)
          )
        )
      if (others.n === 0) return { ok: false, reason: "lastActive" }
    }
    ;[row] = await db
      .update(activity)
      .set({ active })
      .where(eq(activity.id, row.id))
      .returning()
  }

  const record = toRecord(row)
  return record
    ? { ok: true, activity: record, created }
    : { ok: false, reason: "unknownTemplate" }
}
