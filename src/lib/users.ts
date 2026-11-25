/** Shared user role definitions used by the user drawer and app settings. */

export const USER_ROLES = [
  "Owner",
  "Admin",
  "Manager",
  "Coach",
  "Front Desk",
] as const

export type UserRole = (typeof USER_ROLES)[number]

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  Owner: "Full access, including billing and ownership transfer.",
  Admin: "Manage all club data, users and settings.",
  Manager: "Manage reservations, players and coaches.",
  Coach: "View schedules and manage their own classes.",
  "Front Desk": "Handle bookings and point-of-sale.",
}

const ROLE_LABELS = {
  Owner: "Owner",
  Admin: "Admin",
  Manager: "Manager",
  Coach: "Entrenador",
  "Front Desk": "Recepcionista",
  "Super Admin": "Super Admin",
} as const satisfies Record<UserRole | "Super Admin", string>

/** Spanish display label for a stored role value (unknown values pass through). */
export function roleLabel(role: string): string {
  return role in ROLE_LABELS
    ? ROLE_LABELS[role as keyof typeof ROLE_LABELS]
    : role
}
