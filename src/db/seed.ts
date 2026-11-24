import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import * as schema from "@/db/schema"
import {
  club,
  clubMember,
  coach,
  coachActivity,
  coachClass,
  space,
  player,
  reservation,
  sale,
  saleItem,
  stockItem,
  tournament,
  user,
} from "@/db/schema"
import { seedDefaultSpaces } from "@/lib/spaces.server"
import {
  ensureDefaultActivities,
  listActivityRecords,
  primaryActivityFor,
} from "@/lib/activities.server"
import { activityProvides } from "@/lib/activities/templates"
import { createClassSeriesRecord } from "@/lib/classes.server"
import type { ClassSeriesInput } from "@/lib/classes.server"
import { appErrorPayload } from "@/lib/errors"
import { isoWeekday } from "@/lib/recurrence"
import { createPlayerRecord } from "@/lib/players.server"
import { seedDefaultReservationSettings } from "@/lib/reservation-settings.server"
import { SUPER_ADMIN_ROLE } from "@/lib/permissions"
import {
  seedPlayers,
  reservationSeeds,
  stockSeeds,
  saleSeeds,
  coachSeeds,
  classSeeds,
  tournamentSeeds,
} from "@/db/seed-data"

// Standalone seed: creates an initial admin user through Better Auth so the
// password is hashed the same way as a real sign-up. Uses a cookie-less auth
// instance because this runs outside an HTTP request context.
const seedAuth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
})

// Fixed id matching the one inserted by migration 0004 for the seed/backfill.
const DEFAULT_CLUB_ID = "00000000-0000-0000-0000-000000000001"
// Demo only: a second club so the club switcher has somewhere to switch to.
// Has its own courts/settings but no players/reservations, which makes tenant
// scoping observable (its pages are empty).
const NORTH_CLUB_ID = "00000000-0000-0000-0000-000000000002"

const email = process.env.SEED_ADMIN_EMAIL ?? "admin@club.test"
const password = process.env.SEED_ADMIN_PASSWORD ?? "admin1234"
const name = process.env.SEED_ADMIN_NAME ?? "Club Admin"

const superEmail = process.env.SEED_SUPERADMIN_EMAIL ?? "super@club.test"
const superPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? "super1234"

// Creates a club (if missing) with its default activities, spaces (e.g. four
// padel courts) and reservation settings. Idempotent.
async function ensureClub(id: string, clubName: string, slug: string) {
  await db
    .insert(club)
    .values({ id, name: clubName, slug })
    .onConflictDoNothing()
  await ensureDefaultActivities(id)
  await seedDefaultSpaces(id)
  await seedDefaultReservationSettings(id)
  console.log(`✓ Club ready: ${clubName}`)
}

// Maps a club's court numbers (sort order) to court ids for seeding rows.
async function courtIdByNumber(clubId: string): Promise<Map<number, string>> {
  const rows = await db
    .select({ id: space.id, sortOrder: space.sortOrder })
    .from(space)
    .where(eq(space.clubId, clubId))
  return new Map(rows.map((r) => [r.sortOrder, r.id]))
}

async function seedAdmin() {
  try {
    await seedAuth.api.signUpEmail({ body: { email, password, name } })
    console.log(`✓ Seeded admin user: ${email} / ${password}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/exist|unique|already/i.test(message)) {
      console.log(`• Admin user ${email} already exists, skipping.`)
    } else {
      throw err
    }
  }
  // Ensure the admin always has the Owner role in the Default Club (idempotent).
  await db.update(user).set({ role: "Owner" }).where(eq(user.email, email))
  await ensureMembership(email, DEFAULT_CLUB_ID)
}

// Demo only: North Branch, a second tenant for multi-club demos and switcher
// tests, with the admin a member so they can switch between the two clubs.
async function seedNorthBranch() {
  await ensureClub(NORTH_CLUB_ID, "North Branch", "north")
  await ensureMembership(email, NORTH_CLUB_ID)
}

// Adds the user to a club (their default club when it's their first).
// Idempotent.
async function ensureMembership(userEmail: string, clubId: string | null) {
  if (!clubId) return
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, userEmail))
    .limit(1)
  if (rows.length === 0) return
  await db
    .insert(clubMember)
    .values({ userId: rows[0].id, clubId })
    .onConflictDoNothing()
}

async function seedSuperAdmin() {
  const added = await ensureUser({
    email: superEmail,
    name: "Platform Super Admin",
    password: superPassword,
    role: SUPER_ADMIN_ROLE,
    clubId: null,
  })
  console.log(
    added
      ? `✓ Seeded super admin: ${superEmail} / ${superPassword}`
      : `• Super admin ${superEmail} already exists, skipping.`
  )
}

async function ensureUser(opts: {
  email: string
  name: string
  password: string
  role: string
  status?: string
  clubId?: string | null
}) {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, opts.email))
    .limit(1)
  if (existing.length > 0) return false
  await seedAuth.api.signUpEmail({
    body: { email: opts.email, password: opts.password, name: opts.name },
  })
  const clubId = opts.clubId === undefined ? DEFAULT_CLUB_ID : opts.clubId
  await db
    .update(user)
    .set({
      role: opts.role,
      status: opts.status ?? "active",
    })
    .where(eq(user.email, opts.email))
  await ensureMembership(opts.email, clubId)
  return true
}

async function seedTeam() {
  const team = [
    { name: "Ana Martínez", email: "ana@padelclub.com", role: "Admin" },
    { name: "Diego Ruiz", email: "diego@padelclub.com", role: "Manager" },
    { name: "Laura Fernández", email: "laura@padelclub.com", role: "Coach" },
    {
      name: "Pedro Sánchez",
      email: "pedro@padelclub.com",
      role: "Front Desk",
      status: "archived",
    },
  ]
  let created = 0
  for (const member of team) {
    const added = await ensureUser({ ...member, password: "padel1234" })
    if (added) created++
  }
  console.log(
    created > 0
      ? `✓ Seeded ${created} team member(s)`
      : "• Team members already seeded, skipping."
  )
}

async function seedPlayerRoster() {
  const existing = await db.select({ id: player.id }).from(player).limit(1)
  if (existing.length > 0) {
    console.log("• Players already seeded, skipping.")
    return
  }
  // Through the regular write path so each player also gets a padel profile.
  for (const p of seedPlayers) {
    await createPlayerRecord(DEFAULT_CLUB_ID, p)
  }
  console.log(`✓ Seeded ${seedPlayers.length} players`)
}

async function seedReservationSchedule() {
  const existing = await db
    .select({ id: reservation.id })
    .from(reservation)
    .limit(1)
  if (existing.length > 0) {
    console.log("• Reservations already seeded, skipping.")
    return
  }
  const today = new Date().toISOString().slice(0, 10)
  const courts = await courtIdByNumber(DEFAULT_CLUB_ID)
  await db.insert(reservation).values(
    reservationSeeds.map(({ court: courtNumber, ...r }) => {
      const spaceId = courts.get(courtNumber)
      if (!spaceId) throw new Error(`No court #${courtNumber} to seed.`)
      return { ...r, spaceId, date: today, clubId: DEFAULT_CLUB_ID }
    })
  )
  console.log(`✓ Seeded ${reservationSeeds.length} reservations for ${today}`)
}

async function seedInventory() {
  const existing = await db
    .select({ id: stockItem.id })
    .from(stockItem)
    .limit(1)
  if (existing.length > 0) {
    console.log("• Inventory already seeded, skipping.")
    return
  }
  const inserted = await db
    .insert(stockItem)
    .values(stockSeeds.map((s) => ({ ...s, clubId: DEFAULT_CLUB_ID })))
    .returning()
  const idByName = new Map(inserted.map((s) => [s.name, s.id]))
  console.log(`✓ Seeded ${inserted.length} stock items`)

  for (const seed of saleSeeds) {
    const date = new Date(Date.now() - seed.daysAgo * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const [createdSale] = await db
      .insert(sale)
      .values({ date, soldBy: "Club Admin", clubId: DEFAULT_CLUB_ID })
      .returning()
    await db.insert(saleItem).values(
      seed.items.map((line) => ({
        saleId: createdSale.id,
        stockItemId: idByName.get(line.item) ?? null,
        name: line.item,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      }))
    )
  }
  console.log(`✓ Seeded ${saleSeeds.length} sales`)
}

async function seedCoaching() {
  const existing = await db.select({ id: coach.id }).from(coach).limit(1)
  if (existing.length > 0) {
    console.log("• Coaches already seeded, skipping.")
    return
  }
  const inserted = await db
    .insert(coach)
    .values(coachSeeds.map((c) => ({ ...c, clubId: DEFAULT_CLUB_ID })))
    .returning()
  const idByName = new Map(inserted.map((c) => [c.name, c.id]))
  console.log(`✓ Seeded ${inserted.length} coaches`)

  const courts = await courtIdByNumber(DEFAULT_CLUB_ID)
  // The demo classes are padel lessons on the padel courts, so every coach
  // teaches padel.
  const padel = await primaryActivityFor(DEFAULT_CLUB_ID, "sessions")
  if (!padel) throw new Error("No padel activity to seed classes for.")
  await db
    .insert(coachActivity)
    .values(inserted.map((c) => ({ coachId: c.id, activityId: padel.id })))
  await db.insert(coachClass).values(
    classSeeds.map((seed) => {
      const spaceId = courts.get(seed.court)
      if (!spaceId) throw new Error(`No court #${seed.court} to seed.`)
      return {
        coachId: idByName.get(seed.coach) ?? null,
        spaceId,
        activityId: padel.id,
        date: new Date(Date.now() + seed.offsetDays * 86_400_000)
          .toISOString()
          .slice(0, 10),
        startTime: seed.startTime,
        durationMinutes: seed.durationMinutes,
        clubId: DEFAULT_CLUB_ID,
      }
    })
  )
  console.log(`✓ Seeded ${classSeeds.length} classes`)
  await seedClassSeries()
}

// One weekly series per activity that runs classes, from tomorrow for 12
// weeks, on its last space at 07:00: a slot the other demo rows and the e2e
// tests leave free. Dates the space is taken on are skipped, as the drawer
// does.
async function seedClassSeries() {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const coaches = await db
    .select({
      coachId: coachActivity.coachId,
      activityId: coachActivity.activityId,
    })
    .from(coachActivity)
  const spaces = await db
    .select({
      id: space.id,
      activityId: space.activityId,
      sortOrder: space.sortOrder,
    })
    .from(space)
    .where(eq(space.clubId, DEFAULT_CLUB_ID))
  for (const activity of await listActivityRecords(DEFAULT_CLUB_ID)) {
    if (!activityProvides(activity, "sessions")) continue
    const coachId = coaches.find((c) => c.activityId === activity.id)?.coachId
    const last = spaces
      .filter((s) => s.activityId === activity.id)
      .sort((a, b) => b.sortOrder - a.sortOrder)
      .at(0)
    if (!coachId || !last) continue
    const input: ClassSeriesInput = {
      coachId,
      spaceId: last.id,
      startTime: "07:00",
      durationMinutes: 60,
      rule: {
        frequency: "weekly",
        interval: 1,
        weekdays: [isoWeekday(tomorrow)],
        monthlyBy: null,
        startDate: tomorrow,
        until: null,
        count: 12,
        exdates: [],
      },
    }
    try {
      await createClassSeriesRecord(DEFAULT_CLUB_ID, input)
    } catch (err) {
      const taken = appErrorPayload(err)?.params?.all
      if (typeof taken !== "string") throw err
      await createClassSeriesRecord(DEFAULT_CLUB_ID, {
        ...input,
        rule: { ...input.rule, exdates: taken.split(",") },
      })
    }
  }
  console.log("✓ Seeded a weekly class series per activity")
}

async function seedTournaments() {
  const existing = await db
    .select({ id: tournament.id })
    .from(tournament)
    .limit(1)
  if (existing.length > 0) {
    console.log("• Tournaments already seeded, skipping.")
    return
  }
  await db.insert(tournament).values(
    tournamentSeeds.map(({ offsetDays, ...rest }) => ({
      ...rest,
      date: new Date(Date.now() + offsetDays * 86_400_000)
        .toISOString()
        .slice(0, 10),
      clubId: DEFAULT_CLUB_ID,
    }))
  )
  console.log(`✓ Seeded ${tournamentSeeds.length} tournaments`)
}

// The default `db:seed` only bootstraps what the app needs to start in a clean
// state: the Default Club (with its default courts and settings), its Owner
// login and the platform super admin. No business data.
//
// `--demo` (i.e. `bun run db:seed:demo`, used by the E2E suite) adds a second
// club, team users and sample players/reservations/inventory/coaching.
const includeDemo = process.argv.includes("--demo")

async function main() {
  try {
    // The Default Club row is created by a migration; ensure it exists when
    // seeding a fresh database too.
    await ensureClub(DEFAULT_CLUB_ID, "Default Club", "default")
    await seedAdmin()
    await seedSuperAdmin()
    if (includeDemo) {
      await seedNorthBranch()
      await seedTeam()
      await seedPlayerRoster()
      await seedReservationSchedule()
      await seedInventory()
      await seedCoaching()
      await seedTournaments()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Seed failed:", message)
    process.exitCode = 1
  }
  process.exit(process.exitCode ?? 0)
}

void main()
