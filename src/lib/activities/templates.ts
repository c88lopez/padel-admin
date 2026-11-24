// Activity templates: the code-defined presets (Padel, Pilates, …) a club can
// enable. Each template combines generic building blocks (bookable spaces,
// group sessions, competitions, levels) and their defaults. Clubs store
// enabled activities in the `activity` table (template_key + overrides);
// everything else about an activity comes from its template here.

import { IconBallTennis, IconStretching } from "@tabler/icons-react"
import type { Icon } from "@tabler/icons-react"
import type { TFunction } from "i18next"
import type { TranslationKey } from "@/lib/i18n"
import type { en } from "@/locales/en"
import { PADEL_LEVELS } from "./levels"
import type { LevelScale } from "./levels"
import type { SpaceTypeKey } from "./spaces"

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

export interface SpacesConfig {
  // The space types this activity's spaces can be; the first is the default.
  types: readonly [SpaceTypeKey, ...SpaceTypeKey[]]
  // How many spaces a club gets when it first has this activity.
  defaultCount: number
}

// What an activity calls its customers ("Players" for a sport, "Students"
// for pilates): a full set of phrases under `activities.<key>.customers`, so
// each language keeps its own grammar.
export type CustomerTextKey =
  keyof (typeof en)["activities"]["padel"]["customers"]

export interface ActivityTemplate {
  key: string
  nameKey: TranslationKey
  descriptionKey: TranslationKey
  customersKey: `activities.${string}.customers`
  icon: Icon
  // Whether clubs can use it yet. Templates are defined ahead of the features
  // they need and switched on once those blocks exist.
  available: boolean
  blocks: readonly BlockKey[]
  defaults: ActivityConfig
  // Required when the template has the "levels" block.
  levels?: LevelScale
  // Required when the template has the "bookings" or "sessions" block.
  spaces?: SpacesConfig
}

export const ACTIVITY_TEMPLATES = [
  {
    key: "padel",
    nameKey: "activities.padel.name",
    descriptionKey: "activities.padel.description",
    customersKey: "activities.padel.customers",
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
    spaces: { types: ["court"], defaultCount: 4 },
  },
  {
    key: "pilates",
    nameKey: "activities.pilates.name",
    descriptionKey: "activities.pilates.description",
    customersKey: "activities.pilates.customers",
    icon: IconStretching,
    available: true,
    blocks: ["sessions"],
    defaults: {
      sessions: { durationOptions: [45, 50, 60], defaultCapacity: 8 },
    },
    spaces: { types: ["studio"], defaultCount: 1 },
  },
] as const satisfies readonly ActivityTemplate[]

export type ActivityTemplateKey = (typeof ACTIVITY_TEMPLATES)[number]["key"]

// Every club starts with this activity (and existing clubs were backfilled with
// it by migration 0011).
export const DEFAULT_TEMPLATE_KEY: ActivityTemplateKey = "padel"

export function getTemplate(key: string): ActivityTemplate | undefined {
  return ACTIVITY_TEMPLATES.find((t) => t.key === key)
}

/**
 * Why a template can't be switched on or off for a club, or null when it can.
 * Unfinished templates (`available: false`) can't be switched on, so
 * half-built features never reach a club; disabling stays allowed.
 */
export function enableRefusal(
  template: ActivityTemplate | undefined,
  active: boolean
): "unknownTemplate" | "unavailable" | null {
  if (!template) return "unknownTemplate"
  if (active && !template.available) return "unavailable"
  return null
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

/** One of the phrases the template uses for its customers. */
export function customerTextKey(
  template: Pick<ActivityTemplate, "customersKey">,
  key: CustomerTextKey
): TranslationKey {
  return `${template.customersKey}.${key}` as TranslationKey
}

/** The club's name for an activity, else its template's translated name. */
export function activityDisplayName(
  activity: ActivitySummary,
  t: TFunction
): string {
  if (activity.name) return activity.name
  const template = getTemplate(activity.templateKey)
  return template ? t(template.nameKey) : activity.templateKey
}

/** Whether an activity is active and its template provides the block. */
export function activityProvides(
  activity: ActivitySummary | undefined,
  block: BlockKey
): boolean {
  if (!activity?.active) return false
  return (getTemplate(activity.templateKey)?.blocks ?? []).includes(block)
}

/**
 * Spaces usable for a block: those whose activity is active and provides it,
 * e.g. the courts a reservation can go on.
 */
export function spacesForBlock<T extends { activityId: string | null }>(
  spaces: readonly T[],
  activities: readonly ActivitySummary[],
  block: BlockKey
): T[] {
  const ids = new Set(
    activities.filter((a) => activityProvides(a, block)).map((a) => a.id)
  )
  return spaces.filter((s) => s.activityId !== null && ids.has(s.activityId))
}
