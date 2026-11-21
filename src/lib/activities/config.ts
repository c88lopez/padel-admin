import { z } from "zod"
import { primaryActivity } from "./templates"
import type {
  ActivityConfig,
  ActivitySummary,
  ActivityTemplate,
  BookingsConfig,
  SessionsConfig,
} from "./templates"

// Per-club overrides stored in `activity.config` (jsonb). Every field is
// optional: anything missing falls back to the template's defaults.
const duration = z.number().int().min(15).max(480)
const durationOptions = z.array(duration).min(1).max(12)

export const activityConfigSchema = z.object({
  bookings: z
    .object({ durationOptions, defaultDuration: duration })
    .partial()
    .optional(),
  sessions: z
    .object({
      durationOptions,
      defaultCapacity: z.number().int().min(1).max(500).nullable(),
    })
    .partial()
    .optional(),
})

export type ActivityConfigOverrides = z.infer<typeof activityConfigSchema>

function sortedUnique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function resolveBookings(
  defaults: BookingsConfig,
  stored: ActivityConfigOverrides["bookings"]
): BookingsConfig {
  const options = sortedUnique(
    stored?.durationOptions ?? defaults.durationOptions
  )
  const preferred = stored?.defaultDuration ?? defaults.defaultDuration
  return {
    durationOptions: options,
    // The default must be one of the offered options.
    defaultDuration: options.includes(preferred) ? preferred : options[0],
  }
}

function resolveSessions(
  defaults: SessionsConfig,
  stored: ActivityConfigOverrides["sessions"]
): SessionsConfig {
  return {
    durationOptions: sortedUnique(
      stored?.durationOptions ?? defaults.durationOptions
    ),
    defaultCapacity:
      stored?.defaultCapacity !== undefined
        ? stored.defaultCapacity
        : defaults.defaultCapacity,
  }
}

/**
 * Merges a club's stored overrides over the template defaults. Invalid stored
 * data (e.g. written by an older version) is ignored rather than trusted, and
 * only blocks the template provides are returned.
 */
export function resolveActivityConfig(
  template: ActivityTemplate,
  stored: unknown
): ActivityConfig {
  const parsed = activityConfigSchema.safeParse(stored ?? {})
  const overrides = parsed.success ? parsed.data : {}
  const { bookings, sessions } = template.defaults
  return {
    ...(bookings && {
      bookings: resolveBookings(bookings, overrides.bookings),
    }),
    ...(sessions && {
      sessions: resolveSessions(sessions, overrides.sessions),
    }),
  }
}

interface ActivityWithConfig extends ActivitySummary {
  config: ActivityConfig
}

/**
 * Booking lengths to offer for a space: its activity's configured options (or
 * the club's primary bookings activity when the space has none yet). An
 * existing booking's length is always kept selectable, even if it's no longer
 * an option.
 */
export function bookingDurations(
  activities: readonly ActivityWithConfig[],
  activityId: string | null | undefined,
  current?: number
): number[] {
  const activity =
    activities.find((a) => a.id === activityId) ??
    primaryActivity(activities, "bookings")
  const options = [...(activity?.config.bookings?.durationOptions ?? [])]
  if (current !== undefined && !options.includes(current)) options.push(current)
  return options.sort((a, b) => a - b)
}
