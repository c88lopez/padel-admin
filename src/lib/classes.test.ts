import { describe, expect, it } from "vitest"
import { classEnded, classStatus, endTime, planReconcile } from "./classes"

describe("classStatus", () => {
  const date = "2026-06-15"
  const start = "10:00"
  const duration = 90 // ends 11:30

  it("is Upcoming before the start time", () => {
    expect(
      classStatus(date, start, duration, new Date("2026-06-15T09:59:00"))
    ).toBe("Upcoming")
  })

  it("is Ongoing at the start time", () => {
    expect(
      classStatus(date, start, duration, new Date("2026-06-15T10:00:00"))
    ).toBe("Ongoing")
  })

  it("is Ongoing during the session", () => {
    expect(
      classStatus(date, start, duration, new Date("2026-06-15T11:00:00"))
    ).toBe("Ongoing")
  })

  it("is Completed once the session has ended", () => {
    expect(
      classStatus(date, start, duration, new Date("2026-06-15T11:30:00"))
    ).toBe("Completed")
  })

  it("is Upcoming on an earlier day and Completed on a later day", () => {
    expect(
      classStatus(date, start, duration, new Date("2026-06-14T23:59:00"))
    ).toBe("Upcoming")
    expect(
      classStatus(date, start, duration, new Date("2026-06-16T00:01:00"))
    ).toBe("Completed")
  })
})

describe("endTime", () => {
  it("adds the duration to the start time", () => {
    expect(endTime("10:00", 90)).toBe("11:30")
    expect(endTime("09:30", 60)).toBe("10:30")
  })
})

describe("classEnded", () => {
  const now = { date: "2026-06-15", time: "11:30" }

  it("is over once its end has passed", () => {
    expect(classEnded("2026-06-15", "10:00", 90, now)).toBe(true)
    expect(classEnded("2026-06-15", "10:00", 91, now)).toBe(false)
    expect(classEnded("2026-06-14", "20:00", 60, now)).toBe(true)
    expect(classEnded("2026-06-16", "08:00", 60, now)).toBe(false)
  })

  it("handles a class that runs past midnight", () => {
    expect(
      classEnded("2026-06-14", "23:00", 120, {
        date: "2026-06-15",
        time: "00:30",
      })
    ).toBe(false)
    expect(
      classEnded("2026-06-14", "23:00", 120, {
        date: "2026-06-15",
        time: "01:00",
      })
    ).toBe(true)
  })
})

describe("planReconcile", () => {
  const ref = (id: string, seriesDate: string, date = seriesDate) => ({
    id,
    seriesDate,
    date,
    attendeeCount: 1,
  })

  it("keeps classes on surviving dates, removes the rest, adds new ones", () => {
    const plan = planReconcile(
      [ref("a", "2026-03-02"), ref("b", "2026-03-09"), ref("c", "2026-03-16")],
      ["2026-03-02", "2026-03-16", "2026-03-30"],
      0
    )
    expect(plan.keep).toEqual([
      { id: "a", seriesDate: "2026-03-02", date: "2026-03-02" },
      { id: "c", seriesDate: "2026-03-16", date: "2026-03-16" },
    ])
    expect(plan.remove.map((c) => c.id)).toEqual(["b"])
    expect(plan.add).toEqual(["2026-03-30"])
  })

  it("moves classes with the series, keeping a moved class's offset", () => {
    const plan = planReconcile(
      [ref("a", "2026-03-02"), ref("b", "2026-03-09", "2026-03-10")],
      ["2026-03-03", "2026-03-10"],
      1
    )
    expect(plan.keep).toEqual([
      { id: "a", seriesDate: "2026-03-03", date: "2026-03-03" },
      { id: "b", seriesDate: "2026-03-10", date: "2026-03-11" },
    ])
    expect(plan.remove).toEqual([])
    expect(plan.add).toEqual([])
  })
})
