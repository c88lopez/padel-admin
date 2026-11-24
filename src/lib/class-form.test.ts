import { describe, expect, it } from "vitest"
import i18n from "@/lib/i18n"
import {
  capacityValue,
  isCapacity,
  makeClassSchema,
  toClassFormValues,
  withStartDate,
} from "@/lib/class-form"
import type { RecurrenceRule } from "@/lib/recurrence"

const monthly: RecurrenceRule = {
  frequency: "monthly",
  interval: 1,
  weekdays: [],
  monthlyBy: "weekday_of_month",
  startDate: "2026-01-01",
  until: null,
  count: null,
  exdates: [],
}

describe("isCapacity", () => {
  it("takes empty (no limit) and whole numbers from 1 to 500", () => {
    expect(isCapacity("")).toBe(true)
    expect(isCapacity("1")).toBe(true)
    expect(isCapacity("500")).toBe(true)
  })

  it("refuses zero, fractions, over 500 and non-numbers", () => {
    expect(isCapacity("0")).toBe(false)
    expect(isCapacity("2.5")).toBe(false)
    expect(isCapacity("501")).toBe(false)
    expect(isCapacity("abc")).toBe(false)
  })
})

describe("capacityValue", () => {
  it("shows no limit as empty", () => {
    expect(capacityValue(null)).toBe("")
    expect(capacityValue(undefined)).toBe("")
    expect(capacityValue(8)).toBe("8")
  })
})

describe("withStartDate", () => {
  it("moves the rule to the new date, keeping a monthly option it has", () => {
    // 2026-01-08 is the second Thursday.
    expect(withStartDate(monthly, "2026-01-08")).toEqual({
      ...monthly,
      startDate: "2026-01-08",
    })
  })

  it("falls back to the day of the month when the date lacks the option", () => {
    // 2026-01-29 is the fifth Thursday: no "nth weekday" option.
    expect(withStartDate(monthly, "2026-01-29")).toMatchObject({
      startDate: "2026-01-29",
      monthlyBy: "day_of_month",
    })
  })
})

describe("toClassFormValues", () => {
  it("turns a class into the form's strings and date", () => {
    expect(
      toClassFormValues({
        activityId: "a",
        coachId: null,
        spaceId: "s",
        date: "2026-03-04",
        startTime: "10:00",
        durationMinutes: 60,
        capacity: null,
      })
    ).toEqual({
      activityId: "a",
      coachId: "",
      spaceId: "s",
      date: new Date(2026, 2, 4),
      time: "10:00",
      duration: "60",
      capacity: "",
    })
  })
})

describe("makeClassSchema", () => {
  const schema = makeClassSchema(i18n.t)

  it("refuses a capacity out of range", () => {
    const result = schema.safeParse({
      activityId: "a",
      coachId: "c",
      spaceId: "s",
      date: new Date(),
      time: "10:00",
      duration: "60",
      capacity: "0",
    })
    expect(result.success).toBe(false)
  })
})
