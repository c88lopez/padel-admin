import { describe, expect, it } from "vitest"
import {
  calendarDaysBetween,
  nowInZone,
  todayInZone,
  zonedWallTimeToUtcMs,
} from "./tz"

describe("zonedWallTimeToUtcMs", () => {
  it("treats UTC wall time as-is", () => {
    expect(zonedWallTimeToUtcMs("2026-01-15", "12:00", "UTC")).toBe(
      Date.UTC(2026, 0, 15, 12, 0)
    )
  })

  it("applies a fixed (non-DST) offset", () => {
    // New York in January is EST (UTC-5): 12:00 local → 17:00 UTC.
    expect(
      zonedWallTimeToUtcMs("2026-01-15", "12:00", "America/New_York")
    ).toBe(Date.UTC(2026, 0, 15, 17, 0))
  })

  it("applies a positive offset", () => {
    // Madrid in January is CET (UTC+1): 12:00 local → 11:00 UTC.
    expect(zonedWallTimeToUtcMs("2026-01-15", "12:00", "Europe/Madrid")).toBe(
      Date.UTC(2026, 0, 15, 11, 0)
    )
  })
})

describe("todayInZone", () => {
  it("returns the local calendar date for the instant", () => {
    const instant = new Date("2026-01-15T02:00:00Z")
    expect(todayInZone("UTC", instant)).toBe("2026-01-15")
    // 02:00 UTC is still the previous day in New York.
    expect(todayInZone("America/New_York", instant)).toBe("2026-01-14")
  })
})

describe("calendarDaysBetween", () => {
  it("counts whole days forward", () => {
    expect(calendarDaysBetween("2026-01-15", "2026-01-20")).toBe(5)
  })

  it("is zero for the same day", () => {
    expect(calendarDaysBetween("2026-01-15", "2026-01-15")).toBe(0)
  })

  it("is negative for past dates", () => {
    expect(calendarDaysBetween("2026-01-15", "2026-01-10")).toBe(-5)
  })
})

describe("nowInZone", () => {
  it("returns the local date and 24-hour time", () => {
    const instant = new Date("2026-01-15T02:05:00Z")
    expect(nowInZone("UTC", instant)).toEqual({
      date: "2026-01-15",
      time: "02:05",
    })
    expect(nowInZone("America/New_York", instant)).toEqual({
      date: "2026-01-14",
      time: "21:05",
    })
    expect(nowInZone("UTC", new Date("2026-01-15T00:30:00Z")).time).toBe(
      "00:30"
    )
  })
})
