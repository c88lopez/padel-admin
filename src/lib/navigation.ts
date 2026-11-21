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
  IconPalette,
  IconReceipt,
  IconSchool,
  IconTrophy,
  IconUsers,
  IconUserStar,
} from "@tabler/icons-react"
import type { Icon } from "@tabler/icons-react"
import type { TranslationKey } from "@/lib/i18n"
import type { BlockKey } from "@/lib/activities/templates"

// Sidebar group keys (map to `nav.groups.*` translation keys).
export type SidebarGroup =
  | "courts"
  | "inventory"
  | "coaches"
  | "players"
  | "tournaments"

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
}

export const NAV_ENTRIES: NavEntry[] = [
  {
    to: "/",
    icon: IconDashboard,
    sidebarGroup: "courts",
    sidebarLabelKey: "nav.items.dashboard",
    commandGroupKey: "commandPalette.groups.courts",
    commandLabelKey: "commandPalette.items.dashboard",
  },
  {
    to: "/reservations",
    icon: IconCalendar,
    block: "bookings",
    sidebarGroup: "courts",
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
    sidebarGroup: "coaches",
    sidebarLabelKey: "nav.items.coaches",
    commandGroupKey: "commandPalette.groups.coaches",
    commandLabelKey: "commandPalette.items.coaches",
  },
  {
    to: "/coaches/classes",
    icon: IconSchool,
    block: "sessions",
    sidebarGroup: "coaches",
    sidebarLabelKey: "nav.items.classes",
    commandGroupKey: "commandPalette.groups.coaches",
    commandLabelKey: "commandPalette.items.classes",
  },
  {
    to: "/players",
    icon: IconUsers,
    sidebarGroup: "players",
    sidebarLabelKey: "nav.items.players",
    commandGroupKey: "commandPalette.groups.players",
    commandLabelKey: "commandPalette.items.players",
  },
  {
    to: "/tournaments",
    icon: IconTrophy,
    block: "competitions",
    sidebarGroup: "tournaments",
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
    to: "/settings/reservations",
    icon: IconCalendarCog,
    commandGroupKey: "commandPalette.groups.settings",
    commandLabelKey: "commandPalette.items.reservationSettings",
    keywords: "hours courts booking rules reservas pistas",
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

// Sidebar groups in display order, each with the entries that belong to it.
export const SIDEBAR_GROUPS: {
  group: SidebarGroup
  labelKey: TranslationKey
}[] = [
  { group: "courts", labelKey: "nav.groups.courts" },
  { group: "inventory", labelKey: "nav.groups.inventory" },
  { group: "coaches", labelKey: "nav.groups.coaches" },
  { group: "players", labelKey: "nav.groups.players" },
  { group: "tournaments", labelKey: "nav.groups.tournaments" },
]

export interface SidebarNavItem {
  to: string
  icon: Icon
  labelKey: TranslationKey
}

function isVisible(entry: NavEntry, blocks: ReadonlySet<BlockKey>): boolean {
  return entry.block === undefined || blocks.has(entry.block)
}

// Entries for a sidebar group, in declaration order, limited to the building
// blocks the club's activities provide.
export function sidebarItemsForGroup(
  group: SidebarGroup,
  blocks: ReadonlySet<BlockKey>
): SidebarNavItem[] {
  return NAV_ENTRIES.filter(
    (e) => e.sidebarGroup === group && e.sidebarLabelKey && isVisible(e, blocks)
  ).map((e) => ({
    to: e.to,
    icon: e.icon,
    labelKey: e.sidebarLabelKey as TranslationKey,
  }))
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
