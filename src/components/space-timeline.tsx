import { useEffect, useRef, useState } from "react"
import { IconMinus, IconZoomIn } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { spaceNoun, spaceShortName } from "@/lib/activities/spaces"
import { cn } from "@/lib/utils"
import type { SpaceRecord } from "@/lib/spaces.functions"
import { todayHours } from "@/lib/reservation-settings"
import type { ReservationSettingsData } from "@/lib/reservation-settings.functions"
import { endTime } from "@/lib/classes"
import { timeToMin } from "@/lib/reservation-overlap"
import { formatHour, formatTimeRange, useAppSettings } from "@/lib/app-settings"

// One block on a space's row: a reservation, a class, …
export interface TimelineItem {
  id: string
  spaceId: string
  label: string
  startTime: string // "HH:MM"
  durationMinutes: number
  // Appended to the block's tooltip, e.g. "Unpaid".
  detail?: string
}

// px per hour → roughly how many hours fit in a ~800px viewport
const ZOOM_STEPS = [52, 80, 120, 160, 200, 260]
const DEFAULT_ZOOM = 3 // index 3 → 160 px/h → ~5 h visible
const SIDE_PAD = 24 // px of breathing room before open and after close
const LABEL_COL = 64 // w-16 in px — sized to fit the "Court" header / "# N" rows
const BLOCK_GAP = 5 // px horizontal gap between adjacent blocks

// Returns px offset from the left edge of the track area
function toPx(minutes: number, pxPerHour: number, startHour: number): number {
  return SIDE_PAD + ((minutes - startHour * 60) / 60) * pxPerHour
}

/** Today's opening hours as a row per active space, with its items on it. */
export function SpaceTimeline({
  items,
  spaces: allSpaces,
  settings,
  hoveredId,
  onHover,
}: {
  items: TimelineItem[]
  spaces: SpaceRecord[]
  settings: ReservationSettingsData
  hoveredId: string | null
  onHover: (id: string | null) => void
}) {
  const { general } = useAppSettings()
  const dayHours = todayHours(settings)
  const fallback = dayHours.closed
  const startHour = fallback ? 8 : Number(dayHours.open.split(":")[0])
  // Round the close time up to the next hour so the final label is visible.
  const closeParts = dayHours.close.split(":").map(Number)
  const endHour = fallback
    ? 23
    : closeParts[1] > 0
      ? closeParts[0] + 1
      : closeParts[0]
  const totalHours = Math.max(1, endHour - startHour)
  const spaces = allSpaces.filter((s) => s.active)
  const hours = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM)
  const pxPerHour = ZOOM_STEPS[zoomIdx]
  const innerWidth = LABEL_COL + 2 * SIDE_PAD + totalHours * pxPerHour

  const [now, setNow] = useState(() => new Date())
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowInRange = nowMin >= startHour * 60 && nowMin <= endHour * 60

  // Tick the "now" indicator forward, aligned to each minute boundary, so it
  // stays in sync without requiring a page refresh.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const scheduleNextTick = () => {
      timer = setTimeout(
        () => {
          setNow(new Date())
          scheduleNextTick()
        },
        60_000 - (Date.now() % 60_000)
      )
    }
    scheduleNextTick()
    return () => clearTimeout(timer)
  }, [])

  // Center the view on the current time on mount and whenever zoom changes.
  // Reads the time fresh here (instead of depending on the ticking `now`) so the
  // per-minute updates don't yank the user's scroll position.
  useEffect(() => {
    if (!scrollRef.current) return
    const current = new Date()
    const currentMin = current.getHours() * 60 + current.getMinutes()
    if (currentMin < startHour * 60 || currentMin > endHour * 60) return
    const el = scrollRef.current
    requestAnimationFrame(() => {
      // LABEL_COL is sticky so add it to reach the track's coordinate space
      el.scrollLeft =
        LABEL_COL + toPx(currentMin, pxPerHour, startHour) - el.clientWidth / 2
    })
  }, [pxPerHour, startHour, endHour])

  const rawTodayLabel = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  // Spanish locale lowercases the weekday/month; capitalize the first letter
  // so the subtitle reads e.g. "Jueves 11 de junio de 2026".
  const todayLabel =
    rawTodayLabel.charAt(0).toUpperCase() + rawTodayLabel.slice(1)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {todayLabel}
          {fallback && ` · ${"Cerrado hoy"}`}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
            disabled={zoomIdx === 0}
          >
            <IconMinus className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() =>
              setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))
            }
            disabled={zoomIdx === ZOOM_STEPS.length - 1}
          >
            <IconZoomIn className="size-3.5" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto rounded-md border">
        <div style={{ width: innerWidth }}>
          {/* Hour header */}
          <div className="flex border-b">
            <div className="sticky left-0 z-30 flex w-16 shrink-0 items-center border-r bg-background px-3 text-xs font-bold">
              {spaceNoun(spaces)}
            </div>
            <div className="relative h-8 flex-1 overflow-visible">
              {hours.map((h) => (
                <span
                  key={h}
                  className="absolute top-1 -translate-x-1/2 text-[11px] font-bold text-muted-foreground select-none"
                  style={{ left: toPx(h * 60, pxPerHour, startHour) }}
                >
                  {formatHour(h, general.timeFormat)}
                </span>
              ))}
            </div>
          </div>

          {/* Space rows */}
          {spaces.map((space, spaceIdx) => {
            const spaceItems = items.filter((i) => i.spaceId === space.id)
            return (
              <div
                key={space.id}
                className={cn(
                  "flex",
                  spaceIdx < spaces.length - 1 && "border-b"
                )}
              >
                {/* Label */}
                <div className="sticky left-0 z-30 flex w-16 shrink-0 items-center border-r bg-background px-3 text-xs font-bold text-muted-foreground">
                  {spaceShortName(space)}
                </div>

                {/* Track */}
                <div className="relative h-12 flex-1">
                  {/* Hour grid lines */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute top-0 bottom-0 w-px bg-border"
                      style={{ left: toPx(h * 60, pxPerHour, startHour) }}
                    />
                  ))}

                  {/* Now indicator */}
                  {nowInRange && (
                    <div
                      className="absolute top-0 bottom-0 z-20 w-0.5 bg-destructive"
                      style={{ left: toPx(nowMin, pxPerHour, startHour) }}
                    />
                  )}

                  {/* Item blocks */}
                  {spaceItems.map((item) => {
                    const startMin = timeToMin(item.startTime)
                    const range = `${item.startTime} – ${endTime(item.startTime, item.durationMinutes)}`
                    const highlighted = hoveredId === item.id
                    return (
                      <div
                        key={item.id}
                        title={`${item.label} · ${formatTimeRange(range, general.timeFormat)}${item.detail ? ` · ${item.detail}` : ""}`}
                        onMouseEnter={() => onHover(item.id)}
                        onMouseLeave={() => onHover(null)}
                        className={cn(
                          "absolute top-2.5 bottom-2.5 z-10 flex items-center overflow-hidden rounded bg-primary px-2 text-primary-foreground ring-offset-2 ring-offset-background transition-shadow",
                          highlighted && "z-20 ring-2 ring-ring"
                        )}
                        style={{
                          left:
                            toPx(startMin, pxPerHour, startHour) +
                            BLOCK_GAP / 2,
                          width:
                            (item.durationMinutes / 60) * pxPerHour - BLOCK_GAP,
                        }}
                      >
                        <span className="truncate text-[11px] font-medium">
                          {item.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
