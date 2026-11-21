import { describe, expect, it } from "vitest"
import {
  commandItems,
  NAV_ENTRIES,
  SIDEBAR_GROUPS,
  sidebarItemsForGroup,
} from "./navigation"
import { BLOCK_KEYS } from "./activities/templates"
import type { BlockKey } from "./activities/templates"

const ALL_BLOCKS = new Set<BlockKey>(BLOCK_KEYS)
const NO_BLOCKS = new Set<BlockKey>()

describe("navigation registry", () => {
  it("has a unique route for every entry", () => {
    const routes = NAV_ENTRIES.map((e) => e.to)
    expect(new Set(routes).size).toBe(routes.length)
  })

  it("gives every sidebar entry a group and label", () => {
    for (const entry of NAV_ENTRIES) {
      if (entry.sidebarGroup) {
        expect(entry.sidebarLabelKey).toBeTruthy()
      }
    }
  })

  it("gives every command entry a group and label", () => {
    for (const item of commandItems(ALL_BLOCKS)) {
      expect(item.labelKey).toBeTruthy()
      expect(item.groupKey).toBeTruthy()
    }
  })
})

describe("sidebarItemsForGroup", () => {
  it("returns the entries for a group in declaration order", () => {
    const courts = sidebarItemsForGroup("courts", ALL_BLOCKS)
    expect(courts.map((i) => i.to)).toEqual(["/", "/reservations"])
  })

  it("only returns entries that belong to the requested group", () => {
    for (const { group } of SIDEBAR_GROUPS) {
      for (const item of sidebarItemsForGroup(group, ALL_BLOCKS)) {
        const entry = NAV_ENTRIES.find((e) => e.to === item.to)
        expect(entry?.sidebarGroup).toBe(group)
      }
    }
  })

  it("shows every sidebar entry when all blocks are enabled (padel)", () => {
    const shown = SIDEBAR_GROUPS.flatMap(({ group }) =>
      sidebarItemsForGroup(group, ALL_BLOCKS)
    ).map((i) => i.to)
    const all = NAV_ENTRIES.filter((e) => e.sidebarGroup).map((e) => e.to)
    expect(shown).toEqual(all)
  })

  it("hides entries whose building block no activity provides", () => {
    expect(sidebarItemsForGroup("courts", NO_BLOCKS).map((i) => i.to)).toEqual([
      "/",
    ])
    expect(sidebarItemsForGroup("coaches", NO_BLOCKS)).toEqual([])
    expect(sidebarItemsForGroup("tournaments", NO_BLOCKS)).toEqual([])
    // Shared sections don't depend on any activity.
    expect(sidebarItemsForGroup("players", NO_BLOCKS)).toHaveLength(1)
    expect(sidebarItemsForGroup("inventory", NO_BLOCKS)).toHaveLength(3)
  })

  it("shows sessions entries for a sessions-only activity (pilates)", () => {
    const sessionsOnly = new Set<BlockKey>(["sessions"])
    expect(
      sidebarItemsForGroup("coaches", sessionsOnly).map((i) => i.to)
    ).toEqual(["/coaches", "/coaches/classes"])
    expect(sidebarItemsForGroup("tournaments", sessionsOnly)).toEqual([])
  })
})

describe("commandItems", () => {
  it("includes the settings sub-pages that are not in the sidebar", () => {
    const routes = commandItems(ALL_BLOCKS).map((i) => i.to)
    expect(routes).toContain("/settings/general")
    expect(routes).toContain("/settings/activities")
    expect(routes).toContain("/settings/spaces")
    expect(routes).toContain("/settings/ui")
  })

  it("excludes entries that have no command metadata", () => {
    // Every command item must map back to a registry entry with a command label.
    for (const item of commandItems(ALL_BLOCKS)) {
      const entry = NAV_ENTRIES.find((e) => e.to === item.to)
      expect(entry?.commandLabelKey).toBe(item.labelKey)
    }
  })

  it("filters by building block like the sidebar", () => {
    const routes = commandItems(NO_BLOCKS).map((i) => i.to)
    expect(routes).not.toContain("/reservations")
    expect(routes).not.toContain("/tournaments")
    expect(routes).toContain("/players")
  })
})
