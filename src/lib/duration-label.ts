import type { TFunction } from "i18next"
import type { TranslationKey } from "@/lib/i18n"
import { formatDuration } from "@/lib/classes"

// Lengths with a friendlier name than "<n> min".
const DURATION_LABELS: Partial<Record<number, TranslationKey>> = {
  60: "options.oneHour",
  90: "options.onePointFiveHours",
  120: "options.twoHours",
  150: "options.twoPointFiveHours",
  180: "options.threeHours",
}

/** "1 hour", "1.5 hours", … for common lengths, else "45 min". */
export function durationLabel(minutes: number, t: TFunction): string {
  const key = DURATION_LABELS[minutes]
  return key ? t(key) : formatDuration(minutes)
}
