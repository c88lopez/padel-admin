// Single source of truth for app navigation. The sidebar primary nav and the
// command palette both derive their entries from this list so a new page only
// needs to be added once (no drift between the two surfaces).

import {
  IconBell,
  IconBox,
  IconBuildingStore,
  IconCalendar,
  IconCalendarCog,
  IconChartBar,
  IconDashboard,
  IconLayoutGrid,
  IconMapPin,
  IconPalette,
  IconReceipt,
  IconSchool,
  IconTrophy,
  IconUsers,
  IconUserStar,
} from "@tabler/icons-react"
import type { Icon } from "@tabler/icons-react"
import type { TranslationKey } from "@/lib/i18n"
import {
  activityProvides,
  customerTextKey,
  enabledBlocks,
  getTemplate,
} from "@/lib/activities/templates"
import type { ActivitySummary, BlockKey } from "@/lib/activities/templates"

// Sidebar group keys. "activity" entries are repeated in one group per active
// activity that provides their block, labelled with the activity's name.
// "customers" entries are repeated in the Customers group once per active
// activity, labelled with what it calls its customers (Players, Students…).
export type SidebarGroup = "general" | "activity" | "inventory" | "customers"

export interface NavEntry {
  to: string
  icon: Icon
  // Sidebar primary nav. Omit to exclude the entry from the sidebar (e.g. the
  // settings sub-pages, which only live in the command palette).
  sidebarGroup?: SidebarGroup
  sidebarLabelKey?: TranslationKey
  // Command palette. Omit to exclude the entry from the palette.
  commandGroupKey?: TranslationKey
  commandLabelKey?: TranslationKey
  // Extra search terms for the command palette (bilingual hints welcome).
  keywords?: string
  // Only shown when one of the club's active activities provides this
  // building block (e.g. tournaments need "competitions").
  block?: BlockKey
  // The page filters by the `activity` search param, so activity groups link
  // to it already filtered.
  activityFilter?: boolean
}

export const NAV_ENTRIES: NavEntry[] = [
  {
    to: "/",
    icon: IconDashboard,
    sidebarGroup: "general",
    sidebarLabelKey: "nav.items.dashboard",
    commandGroupKey: "commandPalette.groups.courts",
    commandLabelKey: "commandPalette.items.dashboard",
  },
  {
    to: "/reservations",
    icon: IconCalendar,
    block: "bookings",
    sidebarGroup: "activity",
    sidebarLabelKey: "nav.items.reservations",
    commandGroupKey: "commandPalette.groups.courts",
    commandLabelKey: "commandPalette.items.reservations",
  },
  {
    to: "/inventory/dashboard",
    icon: IconChartBar,
    sidebarGroup: "inventory",
    sidebarLabelKey: "nav.items.inventoryDashboard",
    commandGroupKey: "commandPalette.groups.inventory",
    commandLabelKey: "commandPalette.items.salesDashboard",
  },
  {
    to: "/inventory",
    icon: IconBox,
    sidebarGroup: "inventory",
    sidebarLabelKey: "nav.items.stock",
    commandGroupKey: "commandPalette.groups.inventory",
    commandLabelKey: "commandPalette.items.stock",
  },
  {
    to: "/inventory/sales-log",
    icon: IconReceipt,
    sidebarGroup: "inventory",
    sidebarLabelKey: "nav.items.salesLog",
    commandGroupKey: "commandPalette.groups.inventory",
    commandLabelKey: "commandPalette.items.salesLog",
  },
  {
    to: "/coaches",
    icon: IconUserStar,
    block: "sessions",
    activityFilter: true,
    sidebarGroup: "activity",
    sidebarLabelKey: "nav.items.coaches",
    commandGroupKey: "commandPalette.groups.coaches",
    commandLabelKey: "commandPalette.items.coaches",
  },
  {
    to: "/coaches/classes",
    icon: IconSchool,
    block: "sessions",
    activityFilter: true,
    sidebarGroup: "activity",
    sidebarLabelKey: "nav.items.classes",
    commandGroupKey: "commandPalette.groups.coaches",
    commandLabelKey: "commandPalette.items.classes",
  },
  {
    to: "/players",
    icon: IconUsers,
    activityFilter: true,
    sidebarGroup: "customers",
    sidebarLabelKey: "nav.items.players",
    commandGroupKey: "commandPalette.groups.players",
    commandLabelKey: "commandPalette.items.players",
  },
  {
    to: "/tournaments",
    icon: IconTrophy,
    block: "competitions",
    sidebarGroup: "activity",
    sidebarLabelKey: "nav.items.tournaments",
    commandGroupKey: "commandPalette.groups.tournaments",
    commandLabelKey: "commandPalette.items.tournaments",
  },
  // Settings sub-pages: command palette only (the sidebar exposes a single
  // "Settings" entry in its footer).
  {
    to: "/settings/general",
    icon: IconBuildingStore,
    commandGroupKey: "commandPalette.groups.settings",
    commandLabelKey: "commandPalette.items.generalSettings",
    keywords: "club currency locale profile general configuración",
  },
  {
    to: "/settings/activities",
    icon: IconLayoutGrid,
    commandGroupKey: "commandPalette.groups.settings",
    commandLabelKey: "commandPalette.items.activitySettings",
    keywords: "activities modules sports padel pilates actividades deportes",
  },
  {
    to: "/settings/spaces",
    icon: IconMapPin,
    commandGroupKey: "commandPalette.groups.settings",
    commandLabelKey: "commandPalette.items.spaceSettings",
    keywords: "spaces courts studios rooms espacios pistas salas",
  },
  {
    to: "/settings/reservations",
    icon: IconCalendarCog,
    commandGroupKey: "commandPalette.groups.settings",
    commandLabelKey: "commandPalette.items.reservationSettings",
    keywords: "hours booking rules horario reservas",
  },
  {
    to: "/settings/notifications",
    icon: IconBell,
    commandGroupKey: "commandPalette.groups.settings",
    commandLabelKey: "commandPalette.items.notificationSettings",
    keywords: "email whatsapp reminders notificaciones",
  },
  {
    to: "/settings/users",
    icon: IconUsers,
    commandGroupKey: "commandPalette.groups.settings",
    commandLabelKey: "commandPalette.items.users",
    keywords: "roles security password usuarios",
  },
  {
    to: "/settings/ui",
    icon: IconPalette,
    commandGroupKey: "commandPalette.groups.settings",
    commandLabelKey: "commandPalette.items.appearance",
    keywords: "theme accent color font size ui idioma apariencia",
  },
]

export interface SidebarNavItem {
  to: string
  icon: Icon
  labelKey: TranslationKey
  search?: { activity: string }
}

export interface SidebarNavGroup {
  key: string
  // Translated with t(); absent for the unlabelled top group.
  labelKey?: TranslationKey
  // The club's activity name, shown as is.
  label?: string
  items: SidebarNavItem[]
}

function isVisible(entry: NavEntry, blocks: ReadonlySet<BlockKey>): boolean {
  return entry.block === undefined || blocks.has(entry.block)
}

function toSidebarItem(entry: NavEntry, activityId?: string): SidebarNavItem {
  return {
    to: entry.to,
    icon: entry.icon,
    labelKey: entry.sidebarLabelKey as TranslationKey,
    ...(activityId && entry.activityFilter
      ? { search: { activity: activityId } }
      : {}),
  }
}

// Entries for a shared sidebar group, in declaration order.
export function sidebarItemsForGroup(
  group: "general" | "inventory",
  blocks: ReadonlySet<BlockKey>
): SidebarNavItem[] {
  return NAV_ENTRIES.filter(
    (e) => e.sidebarGroup === group && e.sidebarLabelKey && isVisible(e, blocks)
  ).map((e) => toSidebarItem(e))
}

// Entries for one activity's group: those whose block the activity provides.
export function sidebarItemsForActivity(
  activity: ActivitySummary
): SidebarNavItem[] {
  return NAV_ENTRIES.filter(
    (e) =>
      e.sidebarGroup === "activity" &&
      e.sidebarLabelKey &&
      e.block !== undefined &&
      activityProvides(activity, e.block)
  ).map((e) => toSidebarItem(e, activity.id))
}

// The Customers group: each customer entry once per active activity, named
// with the activity's word for its customers.
export function sidebarCustomerItems(
  activities: readonly ActivitySummary[]
): SidebarNavItem[] {
  const entries = NAV_ENTRIES.filter((e) => e.sidebarGroup === "customers")
  return activities.flatMap((a) => {
    const template = getTemplate(a.templateKey)
    if (!a.active || !template) return []
    return entries.map((e) => ({
      ...toSidebarItem(e, a.id),
      labelKey: customerTextKey(template, "title"),
    }))
  })
}

/**
 * The sidebar, in display order: the dashboard, one group per active activity
 * (named after it), then the club-wide sections. Empty groups are dropped.
 */
export function sidebarGroups(
  activities: readonly ActivitySummary[],
  activityName: (activity: ActivitySummary) => string
): SidebarNavGroup[] {
  const blocks = enabledBlocks(activities)
  const groups: SidebarNavGroup[] = [
    { key: "general", items: sidebarItemsForGroup("general", blocks) },
    ...activities
      .filter((a) => a.active)
      .map((a) => ({
        key: `activity:${a.id}`,
        label: activityName(a),
        items: sidebarItemsForActivity(a),
      })),
    {
      key: "inventory",
      labelKey: "nav.groups.inventory",
      items: sidebarItemsForGroup("inventory", blocks),
    },
    {
      key: "customers",
      labelKey: "nav.groups.customers",
      items: sidebarCustomerItems(activities),
    },
  ]
  return groups.filter((g) => g.items.length > 0)
}

export interface CommandNavItem {
  to: string
  icon: Icon
  labelKey: TranslationKey
  groupKey: TranslationKey
  keywords?: string
}

// Command-palette entries, in declaration order, limited to the building
// blocks the club's activities provide.
export function commandItems(blocks: ReadonlySet<BlockKey>): CommandNavItem[] {
  return NAV_ENTRIES.filter(
    (e) => e.commandLabelKey && e.commandGroupKey && isVisible(e, blocks)
  ).map((e) => ({
    to: e.to,
    icon: e.icon,
    labelKey: e.commandLabelKey as TranslationKey,
    groupKey: e.commandGroupKey as TranslationKey,
    keywords: e.keywords,
  }))
}
