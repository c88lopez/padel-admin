import { describe, expect, it } from "vitest"
import {
  commandItems,
  NAV_ENTRIES,
  sidebarCustomerItems,
  sidebarGroups,
  sidebarItemsForActivity,
  sidebarItemsForGroup,
} from "./navigation"
import { BLOCK_KEYS } from "./activities/templates"
import type { ActivitySummary, BlockKey } from "./activities/templates"

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

const padel: ActivitySummary = {
  id: "padel-id",
  templateKey: "padel",
  name: null,
  active: true,
}
const pilates: ActivitySummary = {
  id: "pilates-id",
  templateKey: "pilates",
  name: "Reformer",
  active: true,
}
const nameOf = (a: ActivitySummary) => a.name ?? a.templateKey

function routesOf(items: { to: string }[]) {
  return items.map((i) => i.to)
}

describe("sidebarItemsForGroup", () => {
  it("shows the shared sections regardless of activities", () => {
    expect(routesOf(sidebarItemsForGroup("general", NO_BLOCKS))).toEqual(["/"])
    expect(sidebarItemsForGroup("inventory", NO_BLOCKS)).toHaveLength(3)
  })
})

describe("sidebarItemsForActivity", () => {
  it("gives padel every activity section", () => {
    const shown = routesOf(sidebarItemsForActivity(padel))
    const all = NAV_ENTRIES.filter((e) => e.sidebarGroup === "activity").map(
      (e) => e.to
    )
    expect(shown).toEqual(all)
  })

  it("only gives pilates the sections for its blocks", () => {
    expect(routesOf(sidebarItemsForActivity(pilates))).toEqual([
      "/coaches",
      "/coaches/classes",
    ])
  })

  it("links filterable pages to the activity", () => {
    const items = sidebarItemsForActivity(pilates)
    for (const item of items) {
      expect(item.search).toEqual({ activity: "pilates-id" })
    }
    const reservations = sidebarItemsForActivity(padel).find(
      (i) => i.to === "/reservations"
    )
    expect(reservations?.search).toBeUndefined()
  })

  it("gives an inactive activity nothing", () => {
    expect(sidebarItemsForActivity({ ...padel, active: false })).toEqual([])
  })
})

describe("sidebarCustomerItems", () => {
  it("lists each active activity's customers under its own word", () => {
    const items = sidebarCustomerItems([
      padel,
      pilates,
      { ...pilates, id: "off", active: false },
    ])
    expect(items).toEqual([
      expect.objectContaining({
        to: "/players",
        labelKey: "activities.padel.customers.title",
        search: { activity: "padel-id" },
      }),
      expect.objectContaining({
        to: "/players",
        labelKey: "activities.pilates.customers.title",
        search: { activity: "pilates-id" },
      }),
    ])
  })
})

describe("sidebarGroups", () => {
  it("puts one group per active activity between the dashboard and inventory", () => {
    const groups = sidebarGroups(
      [padel, pilates, { ...pilates, id: "off", active: false }],
      nameOf
    )
    expect(groups.map((g) => g.key)).toEqual([
      "general",
      "activity:padel-id",
      "activity:pilates-id",
      "inventory",
      "customers",
    ])
    expect(groups[1].label).toBe("padel")
    expect(groups[2].label).toBe("Reformer")
    expect(groups[0].label ?? groups[0].labelKey).toBeUndefined()
  })

  it("drops groups with nothing to show", () => {
    const keys = sidebarGroups([], nameOf).map((g) => g.key)
    expect(keys).toEqual(["general", "inventory"])
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
