import { describe, expect, it } from "vitest"
import { resolveActivityConfig } from "./config"
import { getTemplate } from "./templates"
import type { ActivityTemplate } from "./templates"

const padel = getTemplate("padel") as ActivityTemplate
const pilates = getTemplate("pilates") as ActivityTemplate

describe("resolveActivityConfig", () => {
  it("returns the template defaults when nothing is stored", () => {
    expect(resolveActivityConfig(padel, {})).toEqual(padel.defaults)
    expect(resolveActivityConfig(padel, null)).toEqual(padel.defaults)
  })

  it("merges stored overrides over the defaults", () => {
    const config = resolveActivityConfig(padel, {
      bookings: { defaultDuration: 60 },
    })
    expect(config.bookings).toEqual({
      durationOptions: [60, 90, 120, 150, 180],
      defaultDuration: 60,
    })
    expect(config.sessions).toEqual(padel.defaults.sessions)
  })

  it("sorts and de-duplicates duration options", () => {
    const config = resolveActivityConfig(padel, {
      bookings: { durationOptions: [120, 60, 60, 90] },
    })
    expect(config.bookings?.durationOptions).toEqual([60, 90, 120])
  })

  it("falls back to the first option when the default isn't offered", () => {
    const config = resolveActivityConfig(padel, {
      bookings: { durationOptions: [45, 75], defaultDuration: 90 },
    })
    expect(config.bookings?.defaultDuration).toBe(45)
  })

  it("keeps an explicit unlimited (null) or numeric session capacity", () => {
    expect(
      resolveActivityConfig(pilates, { sessions: { defaultCapacity: null } })
        .sessions?.defaultCapacity
    ).toBeNull()
    expect(
      resolveActivityConfig(pilates, { sessions: { defaultCapacity: 12 } })
        .sessions?.defaultCapacity
    ).toBe(12)
  })

  it("ignores invalid stored data instead of trusting it", () => {
    const config = resolveActivityConfig(padel, {
      bookings: { durationOptions: [], defaultDuration: -5 },
    })
    expect(config).toEqual(padel.defaults)
    expect(resolveActivityConfig(padel, "garbage")).toEqual(padel.defaults)
  })

  it("only returns blocks the template provides", () => {
    const config = resolveActivityConfig(pilates, {
      bookings: { defaultDuration: 60 },
    })
    expect(config.bookings).toBeUndefined()
    expect(config.sessions).toBeDefined()
  })
})
