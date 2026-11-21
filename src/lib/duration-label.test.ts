import { describe, expect, it } from "vitest"
import i18n from "@/lib/i18n"
import { durationLabel } from "./duration-label"

const t = i18n.getFixedT("en")

describe("durationLabel", () => {
  it("names common lengths", () => {
    expect(durationLabel(90, t)).toBe(t("options.onePointFiveHours"))
  })

  it("falls back to minutes", () => {
    expect(durationLabel(45, t)).toBe("45 min")
  })
})
