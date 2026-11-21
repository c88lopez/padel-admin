import { describe, expect, it } from "vitest"
import { en } from "@/locales/en"
import { es } from "@/locales/es"
import i18n from "@/lib/i18n"
import {
  ACTIVITY_TEMPLATES,
  activityDisplayName,
  BLOCK_KEYS,
  DEFAULT_TEMPLATE_KEY,
  enableRefusal,
  enabledBlocks,
  getTemplate,
  spacesForBlock,
} from "./templates"
import type { ActivitySummary, ActivityTemplate } from "./templates"
import { getSpaceType } from "./spaces"

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

function summary(templateKey: string, active = true): ActivitySummary {
  return { id: templateKey, templateKey, name: null, active }
}

describe("activity templates", () => {
  it("have unique keys", () => {
    const keys = ACTIVITY_TEMPLATES.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("include the default template, and it is available", () => {
    expect(getTemplate(DEFAULT_TEMPLATE_KEY)?.available).toBe(true)
  })

  it("only use known building blocks", () => {
    for (const template of ACTIVITY_TEMPLATES) {
      for (const block of template.blocks) {
        expect(BLOCK_KEYS).toContain(block)
      }
    }
  })

  it("provide defaults for the blocks that need configuration", () => {
    const templates: readonly ActivityTemplate[] = ACTIVITY_TEMPLATES
    for (const template of templates) {
      const blocks: readonly string[] = template.blocks
      expect(Boolean(template.defaults.bookings)).toBe(
        blocks.includes("bookings")
      )
      expect(Boolean(template.defaults.sessions)).toBe(
        blocks.includes("sessions")
      )
    }
  })

  it("define a level scale exactly when they have the levels block", () => {
    const templates: readonly ActivityTemplate[] = ACTIVITY_TEMPLATES
    for (const template of templates) {
      expect(Boolean(template.levels)).toBe(template.blocks.includes("levels"))
    }
  })

  it("define known space types exactly when they have bookings or sessions", () => {
    const templates: readonly ActivityTemplate[] = ACTIVITY_TEMPLATES
    for (const template of templates) {
      const needsSpaces =
        template.blocks.includes("bookings") ||
        template.blocks.includes("sessions")
      expect(Boolean(template.spaces), template.key).toBe(needsSpaces)
      for (const type of template.spaces?.types ?? []) {
        expect(getSpaceType(type), `${template.key} ${type}`).toBeDefined()
      }
      if (template.spaces) {
        expect(template.spaces.defaultCount).toBeGreaterThan(0)
      }
    }
  })

  it("are translated in every locale", () => {
    for (const template of ACTIVITY_TEMPLATES) {
      for (const key of [template.nameKey, template.descriptionKey]) {
        expect(lookup(en, key), `en ${key}`).toEqual(expect.any(String))
        expect(lookup(es, key), `es ${key}`).toEqual(expect.any(String))
      }
    }
  })

  it("returns undefined for unknown templates", () => {
    expect(getTemplate("quidditch")).toBeUndefined()
  })
})

describe("enabledBlocks", () => {
  it("collects the blocks of active activities", () => {
    expect([...enabledBlocks([summary("pilates")])]).toEqual(["sessions"])
    expect(enabledBlocks([summary("padel")])).toEqual(new Set(BLOCK_KEYS))
  })

  it("ignores inactive activities and unknown templates", () => {
    expect(enabledBlocks([summary("padel", false)]).size).toBe(0)
    expect(enabledBlocks([summary("quidditch")]).size).toBe(0)
  })

  it("unions the blocks of several activities", () => {
    const blocks = enabledBlocks([summary("pilates"), summary("padel", false)])
    expect([...blocks]).toEqual(["sessions"])
  })
})

describe("spacesForBlock", () => {
  const activities = [summary("padel"), summary("pilates")]
  const spaces = [
    { id: "court", activityId: "padel" },
    { id: "studio", activityId: "pilates" },
    { id: "legacy", activityId: null },
  ]

  it("keeps the spaces whose activity provides the block", () => {
    expect(
      spacesForBlock(spaces, activities, "bookings").map((s) => s.id)
    ).toEqual(["court"])
    expect(
      spacesForBlock(spaces, activities, "sessions").map((s) => s.id)
    ).toEqual(["court", "studio"])
  })

  it("drops spaces of inactive activities", () => {
    expect(
      spacesForBlock(spaces, [summary("padel", false)], "bookings")
    ).toEqual([])
  })
})

describe("activityDisplayName", () => {
  const t = i18n.getFixedT("es")

  it("prefers the club's name, else the template's", () => {
    expect(
      activityDisplayName({ ...summary("padel"), name: "Pádel Pro" }, t)
    ).toBe("Pádel Pro")
    expect(activityDisplayName(summary("padel"), t)).toBe("Pádel")
  })
})

describe("enableRefusal", () => {
  const unfinished = {
    ...(getTemplate("pilates") as ActivityTemplate),
    available: false,
  }

  it("refuses unknown templates", () => {
    expect(enableRefusal(undefined, true)).toBe("unknownTemplate")
  })

  it("refuses to switch on an unfinished template, but not off", () => {
    expect(enableRefusal(unfinished, true)).toBe("unavailable")
    expect(enableRefusal(unfinished, false)).toBeNull()
  })

  it("allows available templates", () => {
    expect(enableRefusal(getTemplate("pilates"), true)).toBeNull()
  })
})
