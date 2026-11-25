import { describe, expect, it } from "vitest"
import {
  SPACE_TYPES,
  defaultSpaceName,
  getSpaceType,
  spaceDisplayName,
  spaceNoun,
  spaceNumberLabel,
  spaceShortName,
} from "./spaces"

describe("space types", () => {
  it("have unique keys", () => {
    const keys = SPACE_TYPES.map((type) => type.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("returns undefined for unknown types", () => {
    expect(getSpaceType("trampoline")).toBeUndefined()
  })
})

describe("defaultSpaceName", () => {
  it("numbers the type's English word", () => {
    expect(defaultSpaceName("court", 3)).toBe("Court 3")
    expect(defaultSpaceName("studio", 1)).toBe("Studio 1")
  })
})

describe("spaceDisplayName", () => {
  it("shows default names with the type's Spanish name", () => {
    expect(spaceDisplayName({ name: "Court 3", type: "court" })).toBe("Pista 3")
    expect(spaceDisplayName({ name: "studio 2", type: "studio" })).toBe(
      "Sala 2"
    )
  })

  it("leaves names a club chose as they are", () => {
    expect(spaceDisplayName({ name: "Center Court", type: "court" })).toBe(
      "Center Court"
    )
    // Another type's default name is a custom name for this one.
    expect(spaceDisplayName({ name: "Studio 1", type: "court" })).toBe(
      "Studio 1"
    )
  })

  it("leaves spaces of unknown types as they are", () => {
    expect(spaceDisplayName({ name: "Court 1", type: "lane" })).toBe("Court 1")
  })
})

describe("spaceShortName", () => {
  it("shortens default names to their number", () => {
    expect(spaceShortName({ name: "Court 12", type: "court" })).toBe("# 12")
  })

  it("keeps names a club chose", () => {
    expect(spaceShortName({ name: "Center", type: "court" })).toBe("Center")
  })
})

describe("spaceNumberLabel", () => {
  it("labels a number with the type", () => {
    expect(spaceNumberLabel("court", 4)).toBe("Pista 4")
    expect(spaceNumberLabel("studio", 1)).toBe("Sala 1")
  })
})

describe("spaceNoun", () => {
  it("uses the type's name when every space shares it", () => {
    expect(spaceNoun([{ type: "court" }, { type: "court" }])).toBe("Pista")
  })

  it("falls back to the generic noun for mixed or no spaces", () => {
    expect(spaceNoun([{ type: "court" }, { type: "studio" }])).toBe("Espacio")
    expect(spaceNoun([])).toBe("Espacio")
  })
})
