/** Shared user role definitions used by the user drawer and app settings. */

import type { TFunction } from "i18next"
import type { TranslationKey } from "@/lib/i18n"

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

const ROLE_LABEL_KEYS = {
  Owner: "roles.owner",
  Admin: "roles.admin",
  Manager: "roles.manager",
  Coach: "roles.coach",
  "Front Desk": "roles.frontDesk",
  "Super Admin": "roles.superAdmin",
} as const satisfies Record<UserRole | "Super Admin", TranslationKey>

/** Translated display label for a stored role value (unknown values pass through). */
export function roleLabel(t: TFunction, role: string): string {
  return role in ROLE_LABEL_KEYS
    ? t(ROLE_LABEL_KEYS[role as keyof typeof ROLE_LABEL_KEYS])
    : role
}
