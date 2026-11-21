import { describe, expect, it } from "vitest"
import i18n from "@/lib/i18n"
import { en } from "@/locales/en"
import { es } from "@/locales/es"
import {
  SPACE_TYPES,
  defaultSpaceName,
  getSpaceType,
  spaceDisplayName,
  spaceNounKey,
  spaceNumberLabel,
  spaceShortName,
} from "./spaces"

const t = i18n.getFixedT("en")
const tEs = i18n.getFixedT("es")

function lookup(resources: object, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      resources
    )
}

describe("space types", () => {
  it("have unique keys", () => {
    const keys = SPACE_TYPES.map((type) => type.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("are translated in every locale", () => {
    for (const type of SPACE_TYPES) {
      for (const key of [type.nameKey, type.labelKey]) {
        expect(lookup(en, key), `en ${key}`).toEqual(expect.any(String))
        expect(lookup(es, key), `es ${key}`).toEqual(expect.any(String))
      }
    }
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
  it("localizes default names", () => {
    expect(spaceDisplayName({ name: "Court 3", type: "court" }, tEs)).toBe(
      "Pista 3"
    )
    expect(spaceDisplayName({ name: "studio 2", type: "studio" }, t)).toBe(
      "Studio 2"
    )
  })

  it("leaves names a club chose as they are", () => {
    expect(spaceDisplayName({ name: "Center Court", type: "court" }, tEs)).toBe(
      "Center Court"
    )
    // Another type's default name is a custom name for this one.
    expect(spaceDisplayName({ name: "Studio 1", type: "court" }, tEs)).toBe(
      "Studio 1"
    )
  })

  it("leaves spaces of unknown types as they are", () => {
    expect(spaceDisplayName({ name: "Court 1", type: "lane" }, t)).toBe(
      "Court 1"
    )
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
    expect(spaceNumberLabel("court", 4, t)).toBe("Court 4")
    expect(spaceNumberLabel("studio", 1, tEs)).toBe("Sala 1")
  })
})

describe("spaceNounKey", () => {
  it("uses the type's name when every space shares it", () => {
    expect(spaceNounKey([{ type: "court" }, { type: "court" }])).toBe(
      "spaces.types.court.name"
    )
  })

  it("falls back to the generic noun for mixed or no spaces", () => {
    expect(spaceNounKey([{ type: "court" }, { type: "studio" }])).toBe(
      "spaces.name"
    )
    expect(spaceNounKey([])).toBe("spaces.name")
  })
})
