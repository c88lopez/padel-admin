import { createServerFn } from "@tanstack/react-start"
import { and, asc, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { account, club, clubMember, user } from "@/db/schema"
import { auth } from "@/lib/auth"
import { requirePermission, resolveActiveClubId } from "@/lib/auth.server"
import {
  listMemberClubIds,
  listMemberClubs,
  setMemberships,
} from "@/lib/club-members.server"
import { can, SUPER_ADMIN_ROLE } from "@/lib/permissions"
import { USER_ROLES } from "@/lib/users"
import { AppError } from "@/lib/errors"

// Super Admin is assignable only by other super-admins; the schema accepts it
// and the handlers enforce who may use it.
const roleSchema = z.enum([...USER_ROLES, SUPER_ADMIN_ROLE])

const createInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
  password: z.string().min(6),
  clubIds: z.array(z.string().min(1)).optional(),
})

const updateInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
  clubIds: z.array(z.string().min(1)).optional(),
})

// Request-body schemas for the REST routes under src/routes/api/users. Kept
// separate from the drawer-oriented schemas above: POST requires a full body
// while PATCH accepts any subset of fields. Strict, so a caller still sending
// the removed `clubId` gets a 400 instead of having it silently ignored.
export const userApiCreateInput = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    role: roleSchema,
    password: z.string().min(6),
    clubIds: z.array(z.string().min(1)).optional(),
  })
  .strict()

export const userApiPatchInput = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: roleSchema.optional(),
    clubIds: z.array(z.string().min(1)).optional(),
  })
  .strict()

interface Actor {
  role?: string | null
}

// The clubs a user ends up in. Only super-admins may assign the Super Admin
// role, which belongs to no club. Managers (Owner/Admin) may assign any club so
// they can run several. Without `clubIds` the user keeps `current`, or, when
// that's empty, gets the manager's active club.
async function resolveClubIds(
  actor: Actor,
  activeClubId: string | null,
  role: string,
  clubIds: string[] | undefined,
  current: string[]
): Promise<string[]> {
  if (role === SUPER_ADMIN_ROLE) {
    if (!can(actor.role, "clubs:manage")) {
      throw new AppError(
        "errors.user.cannotAssignSuperAdmin",
        "No puedes asignar el rol de Super Admin."
      )
    }
    return []
  }

  let ids = clubIds && clubIds.length > 0 ? [...new Set(clubIds)] : current
  if (ids.length === 0) {
    if (!activeClubId)
      throw new AppError(
        "errors.user.selectClub",
        "Selecciona un club para este usuario."
      )
    ids = [activeClubId]
  }

  const found = await db
    .select({ id: club.id })
    .from(club)
    .where(inArray(club.id, ids))
  if (found.length !== ids.length) {
    throw new AppError(
      "errors.user.invalidClub",
      "Selección de club no válida."
    )
  }
  return ids
}

// Ensures a club manager only touches users of the club they're acting in.
// Super-admins are unrestricted.
async function assertManageable(
  actor: Actor,
  activeClubId: string | null,
  targetId: string
): Promise<void> {
  if (can(actor.role, "clubs:manage")) return
  const rows = await db
    .select({ userId: clubMember.userId })
    .from(clubMember)
    .where(
      and(
        eq(clubMember.userId, targetId),
        eq(clubMember.clubId, activeClubId ?? "")
      )
    )
    .limit(1)
  if (rows.length === 0)
    throw new AppError("errors.user.notFound", "Usuario no encontrado.")
}

// Generates a temporary password that satisfies common policy requirements.
function generateTempPassword(): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 8)
  return `Aa1!${rand}`
}

async function hashPassword(password: string): Promise<string> {
  const ctx = await auth.$context
  return ctx.password.hash(password)
}

export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requirePermission("users:manage")
  const isSuper = can(session.user.role, "clubs:manage")
  const base = db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    })
    .from(user)
  // Super-admins manage everyone; club managers only the active club's users.
  const scoped = isSuper
    ? base
    : base.where(
        inArray(
          user.id,
          db
            .select({ userId: clubMember.userId })
            .from(clubMember)
            .where(
              eq(
                clubMember.clubId,
                (await resolveActiveClubId(session.user)) ?? ""
              )
            )
        )
      )
  const rows = await scoped.orderBy(asc(user.createdAt))
  const clubs = await listMemberClubs(rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, clubs: clubs.get(r.id) ?? [] }))
})

export const createUser = createServerFn({ method: "POST" })
  .validator((data: unknown) => createInput.parse(data))
  .handler(async ({ data }) => {
    const session = await requirePermission("users:manage")
    const clubIds = await resolveClubIds(
      session.user,
      await resolveActiveClubId(session.user),
      data.role,
      data.clubIds,
      []
    )

    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, data.email))
      .limit(1)
    if (existing.length > 0) {
      throw new AppError(
        "errors.user.emailExists",
        "Ya existe un usuario con este correo."
      )
    }

    const id = crypto.randomUUID()
    const now = new Date()
    await db.insert(user).values({
      id,
      name: data.name,
      email: data.email,
      role: data.role,
      status: "active",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(data.password),
      createdAt: now,
      updatedAt: now,
    })
    await setMemberships(id, clubIds)
    return { id }
  })

export const updateUser = createServerFn({ method: "POST" })
  .validator((data: unknown) => updateInput.parse(data))
  .handler(async ({ data }) => {
    const session = await requirePermission("users:manage")
    const activeClubId = await resolveActiveClubId(session.user)
    await assertManageable(session.user, activeClubId, data.id)

    const clubIds = await resolveClubIds(
      session.user,
      activeClubId,
      data.role,
      data.clubIds,
      await listMemberClubIds(data.id)
    )

    const clash = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, data.email))
      .limit(1)
    if (clash.length > 0 && clash[0].id !== data.id) {
      throw new AppError(
        "errors.user.emailExists",
        "Ya existe un usuario con este correo."
      )
    }

    await db
      .update(user)
      .set({
        name: data.name,
        email: data.email,
        role: data.role,
        updatedAt: new Date(),
      })
      .where(eq(user.id, data.id))
    await setMemberships(data.id, clubIds)
    return { id: data.id }
  })

export const resetUserPassword = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const session = await requirePermission("users:manage")
    await assertManageable(
      session.user,
      await resolveActiveClubId(session.user),
      data.id
    )
    const tempPassword = generateTempPassword()
    const hashed = await hashPassword(tempPassword)
    const updated = await db
      .update(account)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(account.userId, data.id))
      .returning({ id: account.id })
    if (updated.length === 0) {
      throw new AppError(
        "errors.user.noPasswordReset",
        "Este usuario no tiene acceso con contraseña para restablecer."
      )
    }
    return { tempPassword }
  })

export const setUserArchived = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ id: z.string().min(1), archived: z.boolean() }).parse(data)
  )
  .handler(async ({ data }) => {
    const session = await requirePermission("users:manage")
    await assertManageable(
      session.user,
      await resolveActiveClubId(session.user),
      data.id
    )
    if (data.archived && data.id === session.user.id) {
      throw new AppError(
        "errors.user.cannotArchiveSelf",
        "No puedes archivar tu propia cuenta."
      )
    }
    await db
      .update(user)
      .set({
        status: data.archived ? "archived" : "active",
        updatedAt: new Date(),
      })
      .where(eq(user.id, data.id))
    return { id: data.id }
  })

export const deleteUser = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const session = await requirePermission("users:manage")
    await assertManageable(
      session.user,
      await resolveActiveClubId(session.user),
      data.id
    )
    if (data.id === session.user.id) {
      throw new AppError(
        "errors.user.cannotDeleteSelf",
        "No puedes eliminar tu propia cuenta."
      )
    }
    await db.delete(user).where(eq(user.id, data.id))
    return { id: data.id }
  })
