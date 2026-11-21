// Activity templates: the code-defined presets (Padel, Pilates, …) a club can
// enable. Each template combines generic building blocks (bookable spaces,
// group sessions, competitions, levels) and their defaults. Clubs store
// enabled activities in the `activity` table (template_key + overrides);
// everything else about an activity comes from its template here.

import { IconBallTennis, IconStretching } from "@tabler/icons-react"
import type { Icon } from "@tabler/icons-react"
import type { TranslationKey } from "@/lib/i18n"
import { PADEL_LEVELS } from "./levels"
import type { LevelScale } from "./levels"

export const BLOCK_KEYS = [
  "bookings",
  "sessions",
  "competitions",
  "levels",
] as const
export type BlockKey = (typeof BLOCK_KEYS)[number]

export interface BookingsConfig {
  durationOptions: readonly number[]
  defaultDuration: number
}

export interface SessionsConfig {
  durationOptions: readonly number[]
  // null = no capacity limit (today's padel lessons).
  defaultCapacity: number | null
}

export interface ActivityConfig {
  bookings?: BookingsConfig
  sessions?: SessionsConfig
}

export interface ActivityTemplate {
  key: string
  nameKey: TranslationKey
  descriptionKey: TranslationKey
  icon: Icon
  // Whether clubs can use it yet. Templates are defined ahead of the features
  // they need and switched on once those blocks exist.
  available: boolean
  blocks: readonly BlockKey[]
  defaults: ActivityConfig
  // Required when the template has the "levels" block.
  levels?: LevelScale
}

export const ACTIVITY_TEMPLATES = [
  {
    key: "padel",
    nameKey: "activities.padel.name",
    descriptionKey: "activities.padel.description",
    icon: IconBallTennis,
    available: true,
    blocks: ["bookings", "sessions", "competitions", "levels"],
    defaults: {
      bookings: {
        durationOptions: [60, 90, 120, 150, 180],
        defaultDuration: 90,
      },
      sessions: { durationOptions: [60, 90, 120], defaultCapacity: null },
    },
    levels: PADEL_LEVELS,
  },
  {
    key: "pilates",
    nameKey: "activities.pilates.name",
    descriptionKey: "activities.pilates.description",
    icon: IconStretching,
    available: false,
    blocks: ["sessions"],
    defaults: {
      sessions: { durationOptions: [45, 50, 60], defaultCapacity: 8 },
    },
  },
] as const satisfies readonly ActivityTemplate[]

export type ActivityTemplateKey = (typeof ACTIVITY_TEMPLATES)[number]["key"]

// Every club starts with this activity (and existing clubs were backfilled with
// it by migration 0011).
export const DEFAULT_TEMPLATE_KEY: ActivityTemplateKey = "padel"

export function getTemplate(key: string): ActivityTemplate | undefined {
  return ACTIVITY_TEMPLATES.find((t) => t.key === key)
}

export interface ActivitySummary {
  id: string
  templateKey: string
  // Club-chosen name; null shows the template's translated name.
  name: string | null
  active: boolean
}

/**
 * The activity that provides a building block: the first active one in the
 * given (display) order, else the first inactive one. Used while the UI still
 * assumes one activity per block, e.g. the level shown for a customer.
 */
export function primaryActivity<T extends ActivitySummary>(
  activities: readonly T[],
  block: BlockKey
): T | undefined {
  const withBlock = activities.filter((a) =>
    (getTemplate(a.templateKey)?.blocks ?? []).includes(block)
  )
  return withBlock.find((a) => a.active) ?? withBlock.at(0)
}

/** Building blocks provided by the club's active, known activities. */
export function enabledBlocks(
  activities: readonly ActivitySummary[]
): Set<BlockKey> {
  const blocks = new Set<BlockKey>()
  for (const activity of activities) {
    if (!activity.active) continue
    for (const block of getTemplate(activity.templateKey)?.blocks ?? []) {
      blocks.add(block)
    }
  }
  return blocks
}
