import { describe, expect, it } from "vitest"
import { durationLabel } from "./duration-label"

describe("durationLabel", () => {
  it("names common lengths", () => {
    expect(durationLabel(90)).toBe("1,5 horas")
  })

  it("falls back to minutes", () => {
    expect(durationLabel(45)).toBe("45 min")
  })
})
