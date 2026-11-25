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
import {
  activityProvides,
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
  sidebarLabel?: string
  // Command palette. Omit to exclude the entry from the palette.
  commandGroup?: string
  commandLabel?: string
  // Extra search terms for the command palette (English synonyms welcome).
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
    sidebarLabel: "Panel",
    commandGroup: "Pistas",
    commandLabel: "Panel",
  },
  {
    to: "/reservations",
    icon: IconCalendar,
    block: "bookings",
    sidebarGroup: "activity",
    sidebarLabel: "Reservas",
    commandGroup: "Pistas",
    commandLabel: "Reservas",
  },
  {
    to: "/inventory/dashboard",
    icon: IconChartBar,
    sidebarGroup: "inventory",
    sidebarLabel: "Panel",
    commandGroup: "Inventario",
    commandLabel: "Panel de ventas",
  },
  {
    to: "/inventory",
    icon: IconBox,
    sidebarGroup: "inventory",
    sidebarLabel: "Stock",
    commandGroup: "Inventario",
    commandLabel: "Stock",
  },
  {
    to: "/inventory/sales-log",
    icon: IconReceipt,
    sidebarGroup: "inventory",
    sidebarLabel: "Registro de ventas",
    commandGroup: "Inventario",
    commandLabel: "Registro de ventas",
  },
  {
    to: "/coaches",
    icon: IconUserStar,
    block: "sessions",
    activityFilter: true,
    sidebarGroup: "activity",
    sidebarLabel: "Entrenadores",
    commandGroup: "Entrenadores",
    commandLabel: "Entrenadores",
  },
  {
    to: "/coaches/classes",
    icon: IconSchool,
    block: "sessions",
    activityFilter: true,
    sidebarGroup: "activity",
    sidebarLabel: "Clases",
    commandGroup: "Entrenadores",
    commandLabel: "Clases",
  },
  {
    to: "/players",
    icon: IconUsers,
    activityFilter: true,
    sidebarGroup: "customers",
    sidebarLabel: "Jugadores",
    commandGroup: "Jugadores",
    commandLabel: "Jugadores",
  },
  {
    to: "/tournaments",
    icon: IconTrophy,
    block: "competitions",
    sidebarGroup: "activity",
    sidebarLabel: "Torneos",
    commandGroup: "Torneos",
    commandLabel: "Torneos",
  },
  // Settings sub-pages: command palette only (the sidebar exposes a single
  // "Settings" entry in its footer).
  {
    to: "/settings/general",
    icon: IconBuildingStore,
    commandGroup: "Configuración",
    commandLabel: "General",
    keywords: "club currency locale profile general configuración",
  },
  {
    to: "/settings/activities",
    icon: IconLayoutGrid,
    commandGroup: "Configuración",
    commandLabel: "Actividades",
    keywords: "activities modules sports padel pilates actividades deportes",
  },
  {
    to: "/settings/spaces",
    icon: IconMapPin,
    commandGroup: "Configuración",
    commandLabel: "Espacios",
    keywords: "spaces courts studios rooms espacios pistas salas",
  },
  {
    to: "/settings/reservations",
    icon: IconCalendarCog,
    commandGroup: "Configuración",
    commandLabel: "Configuración de reservas",
    keywords: "hours booking rules horario reservas",
  },
  {
    to: "/settings/notifications",
    icon: IconBell,
    commandGroup: "Configuración",
    commandLabel: "Configuración de notificaciones",
    keywords: "email whatsapp reminders notificaciones",
  },
  {
    to: "/settings/users",
    icon: IconUsers,
    commandGroup: "Configuración",
    commandLabel: "Usuarios",
    keywords: "roles security password usuarios",
  },
  {
    to: "/settings/ui",
    icon: IconPalette,
    commandGroup: "Configuración",
    commandLabel: "Apariencia",
    keywords: "theme accent color font size ui apariencia",
  },
]

export interface SidebarNavItem {
  to: string
  icon: Icon
  label: string
  search?: { activity: string }
}

export interface SidebarNavGroup {
  key: string
  // Absent for the unlabelled top group.
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
    label: entry.sidebarLabel as string,
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
    (e) => e.sidebarGroup === group && e.sidebarLabel && isVisible(e, blocks)
  ).map((e) => toSidebarItem(e))
}

// Entries for one activity's group: those whose block the activity provides.
export function sidebarItemsForActivity(
  activity: ActivitySummary
): SidebarNavItem[] {
  return NAV_ENTRIES.filter(
    (e) =>
      e.sidebarGroup === "activity" &&
      e.sidebarLabel &&
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
      label: template.customers.title,
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
      label: "Inventario",
      items: sidebarItemsForGroup("inventory", blocks),
    },
    {
      key: "customers",
      label: "Clientes",
      items: sidebarCustomerItems(activities),
    },
  ]
  return groups.filter((g) => g.items.length > 0)
}

export interface CommandNavItem {
  to: string
  icon: Icon
  label: string
  group: string
  keywords?: string
}

// Command-palette entries, in declaration order, limited to the building
// blocks the club's activities provide.
export function commandItems(blocks: ReadonlySet<BlockKey>): CommandNavItem[] {
  return NAV_ENTRIES.filter(
    (e) => e.commandLabel && e.commandGroup && isVisible(e, blocks)
  ).map((e) => ({
    to: e.to,
    icon: e.icon,
    label: e.commandLabel as string,
    group: e.commandGroup as string,
    keywords: e.keywords,
  }))
}
