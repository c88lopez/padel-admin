import { describe, expect, it } from "vitest"
import { allLevels, levelRank, levelsFor, PADEL_LEVELS } from "./levels"
import type { LevelScale } from "./levels"

describe("levelsFor", () => {
  it("returns the group matching the customer's gender", () => {
    expect(levelsFor(PADEL_LEVELS, "Male")).toEqual([
      "C4",
      "C5",
      "C6",
      "C7",
      "C8",
    ])
    expect(levelsFor(PADEL_LEVELS, "Female")).toEqual([
      "D4",
      "D5",
      "D6",
      "D7",
      "D8",
    ])
  })

  it("returns nothing gender-specific when the gender is unknown", () => {
    expect(levelsFor(PADEL_LEVELS, undefined)).toEqual([])
  })

  it("always includes groups open to everyone", () => {
    const scale: LevelScale = {
      groups: [
        { gender: null, levels: ["Beginner", "Advanced"] },
        { gender: "Female", levels: ["Elite W"] },
      ],
    }
    expect(levelsFor(scale, "Male")).toEqual(["Beginner", "Advanced"])
    expect(levelsFor(scale, "Female")).toEqual([
      "Beginner",
      "Advanced",
      "Elite W",
    ])
  })
})

describe("allLevels", () => {
  it("lists every level group by group", () => {
    expect(allLevels(PADEL_LEVELS)).toEqual([
      "C4",
      "C5",
      "C6",
      "C7",
      "C8",
      "D4",
      "D5",
      "D6",
      "D7",
      "D8",
    ])
  })
})

describe("levelRank", () => {
  it("ranks levels within their group", () => {
    expect(levelRank(PADEL_LEVELS, "C4")).toBe(0)
    expect(levelRank(PADEL_LEVELS, "D4")).toBe(0)
    expect(levelRank(PADEL_LEVELS, "C8")).toBe(4)
  })

  it("returns -1 for levels off the scale", () => {
    expect(levelRank(PADEL_LEVELS, "Z9")).toBe(-1)
  })
})
