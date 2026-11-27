import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import {
  IconBell,
  IconBuildingStore,
  IconCalendarCog,
  IconLayoutGrid,
  IconMapPin,
  IconPalette,
  IconUsers,
} from "@tabler/icons-react"
import type { Icon } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { useCan } from "@/hooks/use-permissions"
import type { Permission } from "@/lib/permissions"

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
})

const navItems: {
  to: string
  labelKey: string
  icon: Icon
  permission?: Permission
}[] = [
  {
    to: "/settings/general",
    labelKey: "General",
    icon: IconBuildingStore,
    permission: "settings:manage",
  },
  {
    to: "/settings/activities",
    labelKey: "Actividades",
    icon: IconLayoutGrid,
    permission: "settings:manage",
  },
  {
    to: "/settings/spaces",
    labelKey: "Espacios",
    icon: IconMapPin,
    permission: "settings:manage",
  },
  {
    to: "/settings/reservations",
    labelKey: "Reservas",
    icon: IconCalendarCog,
    permission: "settings:manage",
  },
  {
    to: "/settings/notifications",
    labelKey: "Notificaciones",
    icon: IconBell,
    permission: "settings:manage",
  },
  {
    to: "/settings/users",
    labelKey: "Usuarios",
    icon: IconUsers,
    permission: "users:manage",
  },
  { to: "/settings/ui", labelKey: "Interfaz", icon: IconPalette },
]

function SettingsLayout() {
  const canSettings = useCan("settings:manage")
  const canUsers = useCan("users:manage")
  const visibleItems = navItems.filter((item) => {
    if (item.permission === "settings:manage") return canSettings
    if (item.permission === "users:manage") return canUsers
    return true
  })

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administra tu club, reservas, notificaciones, usuarios y apariencia.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 md:flex-row md:gap-10">
        <nav className="flex shrink-0 gap-1 md:w-48 md:flex-col">
          {visibleItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              )}
              activeProps={{
                className: "bg-muted text-foreground",
              }}
            >
              <item.icon className="size-4" />
              {item.labelKey}
            </Link>
          ))}
        </nav>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-2">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
