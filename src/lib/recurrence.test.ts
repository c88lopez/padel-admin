import { describe, expect, it } from "vitest"
import i18n from "@/lib/i18n"
import {
  addDays,
  addMonths,
  describeRule,
  fullDateLabel,
  isLastWeekdayOfMonth,
  isoWeekday,
  monthlyOptionLabel,
  monthlyOptions,
  occurrences,
  presetLabel,
  presetRules,
  seriesPreview,
  weekdayOrdinal,
} from "./recurrence"
import type { RecurrenceRule } from "./recurrence"

function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    frequency: "weekly",
    interval: 1,
    weekdays: [],
    monthlyBy: null,
    startDate: "2026-03-17", // a Tuesday
    until: null,
    count: null,
    exdates: [],
    ...overrides,
  }
}

const en = i18n.getFixedT("en")
const es = i18n.getFixedT("es")

describe("date helpers", () => {
  it("gives the ISO weekday", () => {
    expect(isoWeekday("2026-03-16")).toBe(1)
    expect(isoWeekday("2026-03-17")).toBe(2)
    expect(isoWeekday("2026-03-22")).toBe(7)
    expect(isoWeekday("1969-12-31")).toBe(3)
  })

  it("gives the weekday's ordinal in its month", () => {
    expect(weekdayOrdinal("2026-03-01")).toBe(1)
    expect(weekdayOrdinal("2026-03-17")).toBe(3)
    expect(weekdayOrdinal("2026-03-31")).toBe(5)
  })

  it("adds days across months and years", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("adds months, clamping to the month's last day", () => {
    expect(addMonths("2026-03-17", 12)).toBe("2027-03-17")
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28")
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28")
  })

  it("knows the month's last weekday", () => {
    expect(isLastWeekdayOfMonth("2026-03-24")).toBe(false)
    expect(isLastWeekdayOfMonth("2026-03-25")).toBe(true)
    expect(isLastWeekdayOfMonth("2026-02-28")).toBe(true)
  })
})

describe("occurrences", () => {
  it("repeats daily, with an interval", () => {
    expect(
      occurrences(rule({ frequency: "daily" }), "2026-03-17", "2026-03-20")
    ).toEqual(["2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20"])
    expect(
      occurrences(
        rule({ frequency: "daily", interval: 3 }),
        "2026-03-17",
        "2026-03-27"
      )
    ).toEqual(["2026-03-17", "2026-03-20", "2026-03-23", "2026-03-26"])
  })

  it("repeats weekly on the start date's weekday by default", () => {
    expect(occurrences(rule({}), "2026-03-01", "2026-04-07")).toEqual([
      "2026-03-17",
      "2026-03-24",
      "2026-03-31",
      "2026-04-07",
    ])
  })

  it("repeats on several weekdays every other week", () => {
    expect(
      occurrences(
        rule({ interval: 2, weekdays: [3, 1] }),
        "2026-03-01",
        "2026-04-12"
      )
    ).toEqual(["2026-03-18", "2026-03-30", "2026-04-01"])
  })

  it("starts at the first rule date when the start date isn't one", () => {
    expect(
      occurrences(
        rule({ weekdays: [1, 3], count: 3 }),
        "2026-01-01",
        "2026-12-31"
      )
    ).toEqual(["2026-03-18", "2026-03-23", "2026-03-25"])
  })

  it("repeats every weekday", () => {
    expect(
      occurrences(
        rule({ weekdays: [1, 2, 3, 4, 5], startDate: "2026-03-20" }),
        "2026-03-20",
        "2026-03-24"
      )
    ).toEqual(["2026-03-20", "2026-03-23", "2026-03-24"])
  })

  it("repeats monthly on a day, skipping months without it", () => {
    expect(
      occurrences(
        rule({ frequency: "monthly", startDate: "2026-01-31" }),
        "2026-01-01",
        "2026-07-31"
      )
    ).toEqual(["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31"])
  })

  it("repeats monthly on the nth weekday", () => {
    expect(
      occurrences(
        rule({ frequency: "monthly", monthlyBy: "weekday_of_month" }),
        "2026-03-01",
        "2026-06-30"
      )
    ).toEqual(["2026-03-17", "2026-04-21", "2026-05-19", "2026-06-16"])
  })

  it("repeats monthly on the last weekday, with an interval", () => {
    expect(
      occurrences(
        rule({
          frequency: "monthly",
          monthlyBy: "last_weekday_of_month",
          interval: 2,
          startDate: "2026-03-31",
        }),
        "2026-03-01",
        "2026-09-30"
      )
    ).toEqual(["2026-03-31", "2026-05-26", "2026-07-28", "2026-09-29"])
  })

  it("skips months without a fifth weekday", () => {
    expect(
      occurrences(
        rule({
          frequency: "monthly",
          monthlyBy: "weekday_of_month",
          startDate: "2026-03-31",
        }),
        "2026-03-01",
        "2026-07-31"
      )
    ).toEqual(["2026-03-31", "2026-06-30"])
  })

  it("repeats yearly, 29 February only on leap years", () => {
    expect(
      occurrences(
        rule({ frequency: "yearly", startDate: "2024-02-29" }),
        "2024-01-01",
        "2033-12-31"
      )
    ).toEqual(["2024-02-29", "2028-02-29", "2032-02-29"])
    expect(
      occurrences(
        rule({ frequency: "yearly", interval: 2 }),
        "2026-01-01",
        "2031-12-31"
      )
    ).toEqual(["2026-03-17", "2028-03-17", "2030-03-17"])
  })

  it("ends on an until date that isn't a rule date", () => {
    expect(
      occurrences(rule({ until: "2026-04-01" }), "2026-01-01", "2026-12-31")
    ).toEqual(["2026-03-17", "2026-03-24", "2026-03-31"])
  })

  it("includes an until date that is a rule date", () => {
    expect(
      occurrences(rule({ until: "2026-03-24" }), "2026-01-01", "2026-12-31")
    ).toEqual(["2026-03-17", "2026-03-24"])
  })

  it("ends after count occurrences, counted from the start", () => {
    expect(occurrences(rule({ count: 3 }), "2026-03-20", "2026-12-31")).toEqual(
      ["2026-03-24", "2026-03-31"]
    )
  })

  it("leaves out exdates, which still count", () => {
    expect(
      occurrences(
        rule({ count: 3, exdates: ["2026-03-24"] }),
        "2026-01-01",
        "2026-12-31"
      )
    ).toEqual(["2026-03-17", "2026-03-31"])
  })

  it("only returns dates within the range", () => {
    expect(occurrences(rule({}), "2026-03-18", "2026-03-30")).toEqual([
      "2026-03-24",
    ])
    expect(occurrences(rule({}), "2026-03-01", "2026-03-16")).toEqual([])
  })
})

describe("monthlyOptions", () => {
  it("offers the day and the nth weekday", () => {
    expect(monthlyOptions("2026-03-17")).toEqual([
      "day_of_month",
      "weekday_of_month",
    ])
  })

  it("offers both the fourth and the last weekday when they're the same", () => {
    expect(monthlyOptions("2026-03-25")).toEqual([
      "day_of_month",
      "weekday_of_month",
      "last_weekday_of_month",
    ])
  })

  it("offers only the last weekday for a fifth one", () => {
    expect(monthlyOptions("2026-03-31")).toEqual([
      "day_of_month",
      "last_weekday_of_month",
    ])
  })
})

describe("presetRules", () => {
  it("builds Calendar's presets from the date", () => {
    expect(
      presetRules("2026-03-17").map((preset) => presetLabel(preset, en))
    ).toEqual([
      "Does not repeat",
      "Daily",
      "Weekly on Tuesday",
      "Monthly on the third Tuesday",
      "Annually on 17 March",
      "Every weekday (Monday to Friday)",
    ])
  })

  it("uses the last weekday for a fifth one", () => {
    expect(presetLabel(presetRules("2026-03-31")[3], en)).toBe(
      "Monthly on the last Tuesday"
    )
  })

  it("never ends", () => {
    for (const { rule: r } of presetRules("2026-03-17")) {
      if (r) expect([r.until, r.count]).toEqual([null, null])
    }
  })
})

describe("describeRule", () => {
  it("describes every frequency and interval in English", () => {
    expect(describeRule(rule({ frequency: "daily", interval: 2 }), en)).toBe(
      "Every 2 days"
    )
    expect(
      describeRule(rule({ interval: 2, weekdays: [3, 1], count: 10 }), en)
    ).toBe("Every 2 weeks on Mon, Wed, 10 times")
    expect(describeRule(rule({ weekdays: [1, 2, 3, 4, 5] }), en)).toBe(
      "Every weekday"
    )
    expect(
      describeRule(
        rule({ frequency: "monthly", startDate: "2026-03-18", count: 1 }),
        en
      )
    ).toBe("Monthly on day 18, once")
    expect(
      describeRule(
        rule({
          frequency: "monthly",
          monthlyBy: "last_weekday_of_month",
          interval: 3,
          startDate: "2026-03-27",
          until: "2027-06-30",
        }),
        en
      )
    ).toBe("Every 3 months on the last Friday, until 30 June 2027")
    expect(describeRule(rule({ frequency: "yearly", interval: 2 }), en)).toBe(
      "Every 2 years on 17 March"
    )
  })

  it("describes rules in Spanish", () => {
    expect(
      describeRule(rule({ interval: 2, weekdays: [1, 3], count: 10 }), es)
    ).toBe("Cada 2 semanas el lun., mié., 10 veces")
    expect(describeRule(rule({}), es)).toBe("Semanalmente el martes")
    expect(
      describeRule(
        rule({ frequency: "monthly", monthlyBy: "weekday_of_month" }),
        es
      )
    ).toBe("Mensualmente el tercer martes")
    expect(
      describeRule(rule({ frequency: "yearly", until: "2030-06-30" }), es)
    ).toBe("Anualmente el 17 de marzo, hasta el 30 de junio de 2030")
  })
})

describe("monthlyOptionLabel", () => {
  it("labels each monthly option for the date", () => {
    expect(
      monthlyOptions("2026-03-25").map((by) =>
        monthlyOptionLabel(by, "2026-03-25", en)
      )
    ).toEqual(["on day 25", "on the fourth Wednesday", "on the last Wednesday"])
    expect(monthlyOptionLabel("weekday_of_month", "2026-03-25", es)).toBe(
      "el cuarto miércoles"
    )
  })
})

describe("fullDateLabel", () => {
  it("writes the date out in the language", () => {
    expect(fullDateLabel("2027-06-30", en)).toBe("30 June 2027")
    expect(fullDateLabel("2027-06-30", es)).toBe("30 de junio de 2027")
  })
})

describe("seriesPreview", () => {
  const today = "2026-03-01"

  it("counts every class of a series that ends within 12 months", () => {
    expect(seriesPreview(rule({ count: 10 }), today)).toEqual({
      count: 10,
      capped: false,
    })
    expect(seriesPreview(rule({ until: "2026-04-01" }), today)).toEqual({
      count: 3,
      capped: false,
    })
  })

  it("leaves out exdates, which still count towards the end", () => {
    expect(
      seriesPreview(rule({ count: 3, exdates: ["2026-03-24"] }), today)
    ).toEqual({ count: 2, capped: false })
  })

  it("counts only the first 12 months of a longer series", () => {
    expect(seriesPreview(rule({}), today)).toEqual({
      count: 50,
      capped: true,
    })
    expect(seriesPreview(rule({ count: 60 }), today).capped).toBe(true)
    expect(seriesPreview(rule({ until: "2027-06-30" }), today).capped).toBe(
      true
    )
  })
})
