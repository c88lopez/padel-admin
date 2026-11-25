import { formatDuration } from "@/lib/classes"

// Lengths with a friendlier name than "<n> min".
const DURATION_LABELS: Partial<Record<number, string>> = {
  60: "1 hora",
  90: "1,5 horas",
  120: "2 horas",
  150: "2,5 horas",
  180: "3 horas",
}

/** "1 hora", "1,5 horas", … for common lengths, else "45 min". */
export function durationLabel(minutes: number): string {
  return DURATION_LABELS[minutes] ?? formatDuration(minutes)
}
