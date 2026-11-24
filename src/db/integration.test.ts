import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import * as schema from "@/db/schema"
import {
  activity,
  classSeries,
  club,
  clubReservationSettings,
  customerActivityProfile,
  coach,
  coachActivity,
  coachClass,
  space,
  player,
  reservation,
  sale,
  saleItem,
  stockItem,
  user,
} from "@/db/schema"
import { bypassRlsForProcess } from "@/db/tenant"
import { DEFAULT_RESERVATION_SETTINGS } from "@/lib/reservation-settings"
import { findOverlap } from "@/lib/reservation-overlap"
import { findStockShortages } from "@/lib/inventory"
import { classStatus } from "@/lib/classes"
import type { RecurrenceRule } from "@/lib/recurrence"
import type { ClassSeriesEdit } from "@/lib/class-series-edit.server"

// Integration tests that exercise the real schema/migrations against a live
// Postgres. They only run when DATABASE_URL_TEST points at a throwaway database
// (the CI `integration` job provides one); otherwise the suite is skipped so the
// default `bun run test` needs no database.
const TEST_URL = process.env.DATABASE_URL_TEST

// The `*.server.ts` helpers exercised in the tenant-isolation block import the
// app's shared `@/db`, which reads `DATABASE_URL`. Point it at the same
// throwaway database as our direct connection so both see identical data.
if (TEST_URL) process.env.DATABASE_URL = TEST_URL

// Fixtures and the helpers under test act on several clubs, so they see past
// row-level security: the direct connection with a session setting, the app's
// `@/db` through the process scope. The "row-level security" block checks the
// policies themselves, without either.
const BYPASS_RLS = "-c app.bypass_rls=on"
bypassRlsForProcess()

// Default club seeded by migration 0004; all domain rows are scoped to it.
const CLUB_ID = "00000000-0000-0000-0000-000000000001"
// A second club used to prove cross-tenant isolation.
const CLUB_B_ID = "00000000-0000-0000-0000-0000000000b2"
// Two fixed courts for this club, created in beforeAll.
const COURT1_ID = "00000000-0000-0000-0000-0000000c0001"
const COURT2_ID = "00000000-0000-0000-0000-0000000c0002"
// A court that belongs to the second club.
const COURT_B_ID = "00000000-0000-0000-0000-0000000c00b1"

describe.skipIf(!TEST_URL)("database integration", () => {
  let pool: Pool
  let db: NodePgDatabase<typeof schema>

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL, options: BYPASS_RLS })
    db = drizzle(pool, { schema })
    await migrate(db, { migrationsFolder: "drizzle" })
    await db
      .insert(club)
      .values({ id: CLUB_ID, name: "Default Club", slug: "default" })
      .onConflictDoNothing()
    await db
      .insert(space)
      .values([
        {
          id: COURT1_ID,
          name: "Court 1",
          type: "court",
          indoor: true,
          active: true,
          sortOrder: 1,
          clubId: CLUB_ID,
        },
        {
          id: COURT2_ID,
          name: "Court 2",
          type: "court",
          indoor: true,
          active: true,
          sortOrder: 2,
          clubId: CLUB_ID,
        },
      ])
      .onConflictDoNothing()
    await db
      .insert(clubReservationSettings)
      .values({ clubId: CLUB_ID, ...DEFAULT_RESERVATION_SETTINGS })
      .onConflictDoNothing()

    // Second club + its own court, for tenant-isolation checks.
    await db
      .insert(club)
      .values({ id: CLUB_B_ID, name: "Second Club", slug: "second-club" })
      .onConflictDoNothing()
    await db
      .insert(space)
      .values({
        id: COURT_B_ID,
        name: "B Court",
        type: "court",
        indoor: true,
        active: true,
        sortOrder: 1,
        clubId: CLUB_B_ID,
      })
      .onConflictDoNothing()
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await db.delete(saleItem)
    await db.delete(sale)
    await db.delete(stockItem)
    await db.delete(coachClass)
    await db.delete(coach)
    await db.delete(reservation)
    await db.delete(player)
    await db.delete(user)
  })

  describe("players", () => {
    it("supports create / list / update / delete", async () => {
      const [created] = await db
        .insert(player)
        .values({
          fullName: "Test Player",
          email: "tp@test.dev",
          phone: "+54 9 11 5000 0000",
          age: 30,
          gender: "Male",
          clubId: CLUB_ID,
        })
        .returning()
      expect(created.id).toBeTruthy()

      expect(await db.select().from(player)).toHaveLength(1)

      await db.update(player).set({ age: 31 }).where(eq(player.id, created.id))
      const [updated] = await db
        .select()
        .from(player)
        .where(eq(player.id, created.id))
      expect(updated.age).toBe(31)

      await db.delete(player).where(eq(player.id, created.id))
      expect(await db.select().from(player)).toHaveLength(0)
    })
  })

  describe("users", () => {
    function newUser(email: string) {
      return {
        id: randomUUID(),
        name: "Test User",
        email,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    }

    it("applies role and status defaults", async () => {
      const [created] = await db
        .insert(user)
        .values(newUser("defaults@test.dev"))
        .returning()
      expect(created.role).toBe("Front Desk")
      expect(created.status).toBe("active")
    })

    it("enforces a unique email", async () => {
      await db.insert(user).values(newUser("dup@test.dev"))
      await expect(
        db.insert(user).values(newUser("dup@test.dev"))
      ).rejects.toThrow()
    })
  })

  describe("user clubs (club-members.server)", () => {
    async function newClubUser(email: string, clubIds: string[]) {
      const { setMemberships } = await import("@/lib/club-members.server")
      const id = randomUUID()
      await db.insert(user).values({
        id,
        name: "Club User",
        email,
        emailVerified: true,
        role: "Manager",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await setMemberships(id, clubIds)
      return id
    }

    it("keeps the given order, so the first club is the default", async () => {
      const { listMemberClubIds } = await import("@/lib/club-members.server")
      const id = await newClubUser("order@test.dev", [CLUB_B_ID, CLUB_ID])
      expect(await listMemberClubIds(id)).toEqual([CLUB_B_ID, CLUB_ID])
    })

    it("keeps existing clubs in place when the list is set again", async () => {
      const { listMemberClubIds, setMemberships } =
        await import("@/lib/club-members.server")
      const id = await newClubUser("keep@test.dev", [CLUB_B_ID])
      await setMemberships(id, [CLUB_ID, CLUB_B_ID])
      expect(await listMemberClubIds(id)).toEqual([CLUB_B_ID, CLUB_ID])
      await setMemberships(id, [CLUB_ID])
      expect(await listMemberClubIds(id)).toEqual([CLUB_ID])
    })

    it("deleting a club deletes only the members left without a club", async () => {
      const { createClubRecord, deleteClubRecord } =
        await import("@/lib/clubs.server")
      const { listMemberClubIds } = await import("@/lib/club-members.server")
      const doomed = await createClubRecord({
        name: "Doomed Club",
        status: "active",
      })
      const onlyThere = await newClubUser("only@test.dev", [doomed.id])
      const alsoElsewhere = await newClubUser("also@test.dev", [
        doomed.id,
        CLUB_ID,
      ])

      await deleteClubRecord(doomed.id)

      const remaining = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, onlyThere))
      expect(remaining).toHaveLength(0)
      expect(await listMemberClubIds(alsoElsewhere)).toEqual([CLUB_ID])
    })
  })

  describe("reservation conflicts", () => {
    const day = "2026-01-15"

    async function book(spaceId: string, startTime: string, duration: number) {
      await db.insert(reservation).values({
        spaceId,
        player: "Booked Player",
        bookedBy: "Front Desk",
        date: day,
        startTime,
        durationMinutes: duration,
        paymentStatus: "paid",
        clubId: CLUB_ID,
      })
    }

    async function sameCourtSlots(spaceId: string) {
      return db
        .select()
        .from(reservation)
        .where(and(eq(reservation.spaceId, spaceId), eq(reservation.date, day)))
    }

    it("flags an overlapping booking on the same court", async () => {
      await book(COURT1_ID, "10:00", 60)
      const conflict = findOverlap(
        { startTime: "10:30", durationMinutes: 60 },
        await sameCourtSlots(COURT1_ID)
      )
      expect(conflict).toBeDefined()
    })

    it("allows back-to-back bookings whose edges touch", async () => {
      await book(COURT1_ID, "10:00", 60)
      const conflict = findOverlap(
        { startTime: "11:00", durationMinutes: 60 },
        await sameCourtSlots(COURT1_ID)
      )
      expect(conflict).toBeUndefined()
    })

    it("does not flag a booking on a different court", async () => {
      await book(COURT1_ID, "10:00", 60)
      const conflict = findOverlap(
        { startTime: "10:00", durationMinutes: 60 },
        await sameCourtSlots(COURT2_ID)
      )
      expect(conflict).toBeUndefined()
    })
  })

  describe("reservation settings", () => {
    it("round-trips the jsonb hours and updates rule columns", async () => {
      const [row] = await db
        .select()
        .from(clubReservationSettings)
        .where(eq(clubReservationSettings.clubId, CLUB_ID))
      expect(row.timezone).toBe(DEFAULT_RESERVATION_SETTINGS.timezone)
      expect(row.hours.sun.closed).toBe(true)
      expect(row.maxConcurrentPerPlayer).toBe(2)

      await db
        .update(clubReservationSettings)
        .set({ minAdvanceHours: 6, maxAdvanceDays: 14 })
        .where(eq(clubReservationSettings.clubId, CLUB_ID))
      const [updated] = await db
        .select()
        .from(clubReservationSettings)
        .where(eq(clubReservationSettings.clubId, CLUB_ID))
      expect(updated.minAdvanceHours).toBe(6)
      expect(updated.maxAdvanceDays).toBe(14)
    })
  })

  describe("inventory", () => {
    it("supports stock item create / list / update / delete", async () => {
      const [created] = await db
        .insert(stockItem)
        .values({
          name: "Test Drink",
          category: "Drinks",
          price: 2.5,
          stock: 30,
          clubId: CLUB_ID,
        })
        .returning()
      expect(created.id).toBeTruthy()
      expect(created.price).toBe(2.5)

      await db
        .update(stockItem)
        .set({ stock: 25 })
        .where(eq(stockItem.id, created.id))
      const [updated] = await db
        .select()
        .from(stockItem)
        .where(eq(stockItem.id, created.id))
      expect(updated.stock).toBe(25)

      await db.delete(stockItem).where(eq(stockItem.id, created.id))
      expect(await db.select().from(stockItem)).toHaveLength(0)
    })

    it("decrements stock when a sale is recorded and cascades item deletes", async () => {
      const [drink] = await db
        .insert(stockItem)
        .values({
          name: "Energy Drink",
          category: "Drinks",
          price: 2.5,
          stock: 10,
          clubId: CLUB_ID,
        })
        .returning()

      const [createdSale] = await db
        .insert(sale)
        .values({ date: "2026-02-01", soldBy: "Front Desk", clubId: CLUB_ID })
        .returning()
      await db.insert(saleItem).values({
        saleId: createdSale.id,
        clubId: CLUB_ID,
        stockItemId: drink.id,
        name: drink.name,
        quantity: 3,
        unitPrice: 2.5,
      })
      await db
        .update(stockItem)
        .set({ stock: sql`${stockItem.stock} - ${3}` })
        .where(eq(stockItem.id, drink.id))

      const [afterSale] = await db
        .select()
        .from(stockItem)
        .where(eq(stockItem.id, drink.id))
      expect(afterSale.stock).toBe(7)

      // Deleting the sale cascades to its line items.
      await db.delete(sale).where(eq(sale.id, createdSale.id))
      expect(await db.select().from(saleItem)).toHaveLength(0)
    })

    it("detects shortages against live stock levels", async () => {
      const [racket] = await db
        .insert(stockItem)
        .values({
          name: "Padel Racket (Pro)",
          category: "Equipment",
          price: 149.99,
          stock: 2,
          clubId: CLUB_ID,
        })
        .returning()

      const levels = await db
        .select({
          id: stockItem.id,
          name: stockItem.name,
          stock: stockItem.stock,
        })
        .from(stockItem)

      expect(
        findStockShortages([{ stockItemId: racket.id, quantity: 2 }], levels)
      ).toEqual([])
      expect(
        findStockShortages([{ stockItemId: racket.id, quantity: 3 }], levels)
      ).toHaveLength(1)
    })
  })

  describe("coaches & classes", () => {
    it("supports coach create / list / update / delete", async () => {
      const [created] = await db
        .insert(coach)
        .values({
          name: "Test Coach",
          phone: "+54 9 11 5000 0000",
          birthday: "1990-01-01",
          clubId: CLUB_ID,
        })
        .returning()
      expect(created.id).toBeTruthy()

      await db
        .update(coach)
        .set({ phone: "+54 9 11 1111 1111" })
        .where(eq(coach.id, created.id))
      const [updated] = await db
        .select()
        .from(coach)
        .where(eq(coach.id, created.id))
      expect(updated.phone).toBe("+54 9 11 1111 1111")

      await db.delete(coach).where(eq(coach.id, created.id))
      expect(await db.select().from(coach)).toHaveLength(0)
    })

    it("allows a coach without a birthday", async () => {
      const [created] = await db
        .insert(coach)
        .values({
          name: "No Birthday",
          phone: "+54 9 11 5000 0002",
          clubId: CLUB_ID,
        })
        .returning()
      expect(created.birthday).toBeNull()
    })

    it("nulls a class's coach when the coach is deleted", async () => {
      const [c] = await db
        .insert(coach)
        .values({
          name: "Temp Coach",
          phone: "+54 9 11 5000 0001",
          birthday: "1991-02-02",
          clubId: CLUB_ID,
        })
        .returning()
      const [padel] = await db
        .select()
        .from(activity)
        .where(
          and(eq(activity.clubId, CLUB_ID), eq(activity.templateKey, "padel"))
        )
      const [cls] = await db
        .insert(coachClass)
        .values({
          coachId: c.id,
          spaceId: COURT1_ID,
          activityId: padel.id,
          date: "2026-03-01",
          startTime: "10:00",
          durationMinutes: 90,
          clubId: CLUB_ID,
        })
        .returning()
      expect(cls.coachId).toBe(c.id)

      await db.delete(coach).where(eq(coach.id, c.id))
      const [orphan] = await db
        .select()
        .from(coachClass)
        .where(eq(coachClass.id, cls.id))
      expect(orphan.coachId).toBeNull()

      // Derived status reflects schedule vs. now.
      expect(
        classStatus(
          orphan.date,
          orphan.startTime,
          orphan.durationMinutes,
          new Date("2026-03-01T09:00:00")
        )
      ).toBe("Upcoming")
      expect(
        classStatus(
          orphan.date,
          orphan.startTime,
          orphan.durationMinutes,
          new Date("2026-03-01T12:00:00")
        )
      ).toBe("Completed")
    })
  })

  // Exercises the real club-scoping in spaces.server.ts: every query is filtered
  // by clubId, so one club must never read or mutate another club's rows.
  describe("row-level security", () => {
    // Tables that aren't club data: the tenant itself and Better Auth's
    // identity tables (see drizzle/CLAUDE.md).
    const WITHOUT_CLUB_ID = [
      "account",
      "club",
      "session",
      "user",
      "verification",
    ]
    // Plus memberships: they have club_id, but are read before a request
    // knows its club.
    const NOT_CLUB_SCOPED = [...WITHOUT_CLUB_ID, "club_member"]

    // A connection with no RLS setting, like the app's before a request knows
    // its club.
    let plain: Pool

    beforeAll(() => {
      plain = new Pool({ connectionString: TEST_URL })
    })

    afterAll(async () => {
      await plain.end()
    })

    async function playerIn(clubId: string, fullName: string) {
      const [row] = await db
        .insert(player)
        .values({
          fullName,
          email: `${randomUUID()}@test.dev`,
          phone: "",
          age: 30,
          gender: "Female",
          clubId,
        })
        .returning()
      return row
    }

    it("runs as a role that RLS applies to", async () => {
      // Superusers and BYPASSRLS roles skip every policy, which would make the
      // tests below pass for the wrong reason (or fail, for the plain ones).
      const { rows } = await plain.query<{
        rolsuper: boolean
        rolbypassrls: boolean
      }>(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
      )
      expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
    })

    it("gives every table but the tenancy ones a club_id", async () => {
      const { rows } = await plain.query<{ table_name: string }>(`
        SELECT t.table_name FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
          AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns c
            WHERE c.table_schema = 'public' AND c.table_name = t.table_name
              AND c.column_name = 'club_id' AND c.is_nullable = 'NO'
          )
        ORDER BY t.table_name
      `)
      expect(rows.map((r) => r.table_name)).toEqual(WITHOUT_CLUB_ID)
    })

    it("enables, forces and has the club policy on every club table", async () => {
      const { rows } = await plain.query<{
        relname: string
        relrowsecurity: boolean
        relforcerowsecurity: boolean
        policies: string[]
      }>(`
        SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
          coalesce(array_agg(p.policyname) FILTER (WHERE p.policyname IS NOT NULL), '{}')::text[] AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
        WHERE c.relkind = 'r'
          AND c.relname NOT IN (${NOT_CLUB_SCOPED.map((t) => `'${t}'`).join(", ")})
        GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
      `)
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row).toEqual({
          relname: row.relname,
          relrowsecurity: true,
          relforcerowsecurity: true,
          policies: ["club_isolation"],
        })
      }
    })

    it("shows no club rows without a club", async () => {
      await playerIn(CLUB_ID, "Unscoped")
      const { rows } = await plain.query("SELECT id FROM player")
      expect(rows).toHaveLength(0)
      await expect(
        plain.query(
          "INSERT INTO player (id, full_name, email, phone, age, gender, club_id, created_at) VALUES ($1, 'X', 'x@test.dev', '', 30, 'Male', $2, now())",
          [randomUUID(), CLUB_ID]
        )
      ).rejects.toThrow(/row-level security/)
    })

    it("shows and writes only the scoped club's rows through the app's db", async () => {
      const { db: appDb, createScopedDb } = await import("@/db")
      const { withClubScope } = await import("@/db/tenant")
      const mine = await playerIn(CLUB_ID, "Mine")
      const theirs = await playerIn(CLUB_B_ID, "Theirs")
      // A db over a connection without the session bypass, as in the app.
      const scopedDb = createScopedDb(new Pool({ connectionString: TEST_URL }))
      try {
        // No club filter in the query: the policy does the scoping.
        const seen = await withClubScope(CLUB_ID, () =>
          scopedDb.select({ id: player.id }).from(player)
        )
        expect(seen.map((r) => r.id)).toEqual([mine.id])

        const inTx = await withClubScope(CLUB_B_ID, () =>
          scopedDb.transaction((tx) =>
            tx.select({ id: player.id }).from(player)
          )
        )
        expect(inTx.map((r) => r.id)).toEqual([theirs.id])

        // Writing another club's row, or touching one, is refused or a no-op.
        await expect(
          withClubScope(CLUB_ID, () =>
            scopedDb.insert(player).values({
              fullName: "Smuggled",
              email: "smuggled@test.dev",
              phone: "",
              age: 30,
              gender: "Male",
              clubId: CLUB_B_ID,
            })
          )
        ).rejects.toThrow()
        const updated = await withClubScope(CLUB_ID, () =>
          scopedDb
            .update(player)
            .set({ fullName: "Hijacked" })
            .where(eq(player.id, theirs.id))
            .returning()
        )
        expect(updated).toHaveLength(0)
      } finally {
        await scopedDb.$client.end()
      }
      // The shared app db runs with the process bypass in this suite.
      expect(
        (await appDb.select({ id: player.id }).from(player)).length
      ).toBeGreaterThanOrEqual(2)
    })
  })

  describe("tenant isolation (spaces.server)", () => {
    // Loaded dynamically (not a static import) so the app's `@/db` connects only
    // after DATABASE_URL is pointed at the test database above.
    const loadSpaces = () => import("@/lib/spaces.server")
    let spaces: Awaited<ReturnType<typeof loadSpaces>>

    beforeAll(async () => {
      spaces = await loadSpaces()
    })

    it("lists only the requested club's courts", async () => {
      const a = await spaces.listSpaceRecords(CLUB_ID)
      const aIds = a.map((c) => c.id)
      expect(aIds).toEqual(expect.arrayContaining([COURT1_ID, COURT2_ID]))
      // Club A must never see the other club's court.
      expect(aIds).not.toContain(COURT_B_ID)

      // Club B sees exactly its own court — none of club A's leak through.
      const b = await spaces.listSpaceRecords(CLUB_B_ID)
      expect(b.map((c) => c.id)).toEqual([COURT_B_ID])
    })

    it("refuses to update another club's court", async () => {
      await expect(
        spaces.updateSpaceRecord(CLUB_B_ID, {
          id: COURT1_ID,
          name: "Hijacked",
        })
      ).rejects.toThrow("Space not found.")

      const [row] = await db.select().from(space).where(eq(space.id, COURT1_ID))
      expect(row.name).toBe("Court 1")
    })

    it("does not delete another club's court", async () => {
      await spaces.deleteSpaceRecord(CLUB_B_ID, COURT1_ID)
      const rows = await db.select().from(space).where(eq(space.id, COURT1_ID))
      expect(rows).toHaveLength(1)
    })

    it("treats another club's court as not bookable", async () => {
      await expect(
        spaces.assertSpaceBookable(CLUB_B_ID, COURT1_ID, "bookings")
      ).rejects.toThrow()
      // Sanity: the court is bookable within its own club.
      await expect(
        spaces.assertSpaceBookable(CLUB_ID, COURT1_ID, "bookings")
      ).resolves.toMatchObject({ templateKey: "padel" })
    })
  })

  describe("classes (classes, class-series, class-attendees)", () => {
    const loadClasses = async () => ({
      ...(await import("@/lib/classes.server")),
      ...(await import("@/lib/class-series.server")),
      ...(await import("@/lib/class-series-edit.server")),
      ...(await import("@/lib/class-attendees.server")),
    })
    const loadSpaces = () => import("@/lib/spaces.server")
    let classes: Awaited<ReturnType<typeof loadClasses>>
    let spaces: Awaited<ReturnType<typeof loadSpaces>>

    beforeAll(async () => {
      classes = await loadClasses()
      spaces = await loadSpaces()
    })

    // A throwaway club with padel (no class capacity by default), pilates
    // (8 by default, inserted directly), a court, a
    // studio and a coach. Deleting the club cascades.
    async function clubWithClasses() {
      const clubId = randomUUID()
      await db
        .insert(club)
        .values({ id: clubId, name: `Club ${clubId}`, slug: `club-${clubId}` })
      const [padel, pilates] = await db
        .insert(activity)
        .values([
          { clubId, templateKey: "padel", sortOrder: 0 },
          { clubId, templateKey: "pilates", sortOrder: 1 },
        ])
        .returning()
      await spaces.seedDefaultSpaces(clubId)
      const list = await spaces.listSpaceRecords(clubId)
      const court = list.find((s) => s.activityId === padel.id)
      const studio = list.find((s) => s.activityId === pilates.id)
      if (!court || !studio) throw new Error("Default spaces missing.")
      const [c] = await db
        .insert(coach)
        .values({
          name: "Class Coach",
          phone: "+54 9 11 5000 0002",
          birthday: "1990-01-01",
          clubId,
        })
        .returning()
      await db.insert(coachActivity).values([
        { coachId: c.id, activityId: padel.id, clubId },
        { coachId: c.id, activityId: pilates.id, clubId },
      ])
      const base = {
        coachId: c.id,
        date: "2026-03-02",
        startTime: "10:00",
        durationMinutes: 60,
      }
      return { clubId, padel, pilates, court, studio, base }
    }

    it("is for its space's activity, with that activity's capacity", async () => {
      const { clubId, padel, pilates, court, studio, base } =
        await clubWithClasses()

      const lesson = await classes.createClassRecord(clubId, {
        ...base,
        spaceId: court.id,
      })
      expect(lesson).toMatchObject({ activityId: padel.id, capacity: null })

      const pilatesClass = await classes.createClassRecord(clubId, {
        ...base,
        spaceId: studio.id,
      })
      expect(pilatesClass).toMatchObject({
        activityId: pilates.id,
        capacity: 8,
      })
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("keeps an explicit capacity, or no limit", async () => {
      const { clubId, studio, base } = await clubWithClasses()
      const small = await classes.createClassRecord(clubId, {
        ...base,
        spaceId: studio.id,
        capacity: 4,
      })
      expect(small.capacity).toBe(4)
      const open = await classes.createClassRecord(clubId, {
        ...base,
        spaceId: studio.id,
        startTime: "12:00",
        capacity: null,
      })
      expect(open.capacity).toBeNull()
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("follows its space to another activity, keeping its capacity", async () => {
      const { clubId, padel, court, studio, base } = await clubWithClasses()
      const created = await classes.createClassRecord(clubId, {
        ...base,
        spaceId: studio.id,
      })
      const moved = await classes.updateClassRecord(clubId, {
        ...base,
        id: created.id,
        spaceId: court.id,
      })
      expect(moved).toMatchObject({ activityId: padel.id, capacity: 8 })
      await db.delete(club).where(eq(club.id, clubId))
    })

    // Customers of the club, inserted directly.
    async function customers(clubId: string, n: number): Promise<string[]> {
      const rows = await db
        .insert(player)
        .values(
          Array.from({ length: n }, (_, i) => ({
            fullName: `Customer ${i + 1}`,
            email: `c${i + 1}@example.com`,
            phone: "600000000",
            age: 30,
            gender: "Female",
            clubId,
          }))
        )
        .returning()
      return rows.map((r) => r.id)
    }

    it("signs customers up until the class is full", async () => {
      const { clubId, studio, base } = await clubWithClasses()
      const cls = await classes.createClassRecord(clubId, {
        ...base,
        spaceId: studio.id,
        capacity: 2,
      })
      const [a, b, c] = await customers(clubId, 3)
      await classes.addAttendeeRecord(clubId, cls.id, a)
      await classes.addAttendeeRecord(clubId, cls.id, b)
      // Signing up again is a no-op, not a second place.
      await classes.addAttendeeRecord(clubId, cls.id, a)
      await expect(
        classes.addAttendeeRecord(clubId, cls.id, c)
      ).rejects.toThrow("errors.class.full")
      expect(
        (await classes.listAttendeeRecords(clubId, cls.id)).map(
          (r) => r.playerId
        )
      ).toEqual([a, b])

      // Removing someone frees a place.
      await classes.removeAttendeeRecord(clubId, cls.id, a)
      await classes.addAttendeeRecord(clubId, cls.id, c)
      expect(await classes.listAttendeeRecords(clubId, cls.id)).toHaveLength(2)
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("makes someone signing up a customer of the class's activity", async () => {
      const { clubId, pilates, studio, base } = await clubWithClasses()
      const cls = await classes.createClassRecord(clubId, {
        ...base,
        spaceId: studio.id,
      })
      const [a] = await customers(clubId, 1)
      await classes.addAttendeeRecord(clubId, cls.id, a)
      const profiles = await db
        .select()
        .from(customerActivityProfile)
        .where(eq(customerActivityProfile.customerId, a))
      expect(profiles.map((p) => p.activityId)).toEqual([pilates.id])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("never gives the last place twice", async () => {
      const { clubId, studio, base } = await clubWithClasses()
      const cls = await classes.createClassRecord(clubId, {
        ...base,
        spaceId: studio.id,
        capacity: 1,
      })
      const [first, second] = await customers(clubId, 2)

      // Another sign-up holds the class row and takes the last place, but
      // hasn't committed yet.
      const other = await pool.connect()
      await other.query("BEGIN")
      await other.query("SELECT id FROM coach_class WHERE id = $1 FOR UPDATE", [
        cls.id,
      ])
      await other.query(
        "INSERT INTO coach_class_attendee (class_id, player_id, club_id, created_at) VALUES ($1, $2, $3, now())",
        [cls.id, first, clubId]
      )

      // This one has to wait for that lock, then sees the class full. Without
      // the lock it would count 0 attendees and take the place too.
      const pending = classes.addAttendeeRecord(clubId, cls.id, second).then(
        () => "added",
        (err: unknown) => String(err)
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
      await other.query("COMMIT")
      other.release()

      expect(await pending).toContain("errors.class.full")
      expect(await classes.listAttendeeRecords(clubId, cls.id)).toHaveLength(1)
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("has no limit without a capacity", async () => {
      const { clubId, court, base } = await clubWithClasses()
      const lesson = await classes.createClassRecord(clubId, {
        ...base,
        spaceId: court.id,
      })
      for (const id of await customers(clubId, 3)) {
        await classes.addAttendeeRecord(clubId, lesson.id, id)
      }
      expect(await classes.listAttendeeRecords(clubId, lesson.id)).toHaveLength(
        3
      )
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("won't lower the capacity below who's signed up", async () => {
      const { clubId, studio, base } = await clubWithClasses()
      const cls = await classes.createClassRecord(clubId, {
        ...base,
        spaceId: studio.id,
        capacity: 3,
      })
      for (const id of await customers(clubId, 2)) {
        await classes.addAttendeeRecord(clubId, cls.id, id)
      }
      const edit = { ...base, id: cls.id, spaceId: studio.id }
      await expect(
        classes.updateClassRecord(clubId, { ...edit, capacity: 1 })
      ).rejects.toThrow("errors.class.capacityBelowAttendees")
      expect(
        await classes.updateClassRecord(clubId, { ...edit, capacity: 2 })
      ).toMatchObject({ capacity: 2 })
      expect(
        await classes.updateClassRecord(clubId, { ...edit, capacity: null })
      ).toMatchObject({ capacity: null })
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("keeps attendees within the club", async () => {
      const { clubId, studio, base } = await clubWithClasses()
      const other = await clubWithClasses()
      const cls = await classes.createClassRecord(clubId, {
        ...base,
        spaceId: studio.id,
      })
      const [mine] = await customers(clubId, 1)
      const [theirs] = await customers(other.clubId, 1)

      await expect(
        classes.addAttendeeRecord(clubId, cls.id, theirs)
      ).rejects.toThrow("errors.class.playerNotFound")
      await expect(
        classes.addAttendeeRecord(other.clubId, cls.id, theirs)
      ).rejects.toThrow("errors.class.notFound")

      await classes.addAttendeeRecord(clubId, cls.id, mine)
      expect(await classes.listAttendeeRecords(other.clubId, cls.id)).toEqual(
        []
      )
      await classes.removeAttendeeRecord(other.clubId, cls.id, mine)
      expect(await classes.listAttendeeRecords(clubId, cls.id)).toHaveLength(1)
      await db.delete(club).where(eq(club.id, clubId))
      await db.delete(club).where(eq(club.id, other.clubId))
    })

    it("can't overlap a reservation or another class on its space", async () => {
      const { clubId, court, base } = await clubWithClasses()
      await db.insert(reservation).values({
        spaceId: court.id,
        player: "Ana",
        bookedBy: "Admin",
        date: base.date,
        startTime: "10:00",
        durationMinutes: 60,
        paymentStatus: "paid",
        clubId,
      })
      const at = (startTime: string) => ({
        ...base,
        spaceId: court.id,
        startTime,
      })

      await expect(
        classes.createClassRecord(clubId, at("10:30"))
      ).rejects.toThrow("errors.reservation.conflict")
      // Back to back is fine.
      const lesson = await classes.createClassRecord(clubId, at("11:00"))
      await expect(
        classes.createClassRecord(clubId, at("11:30"))
      ).rejects.toThrow("errors.space.classConflict")
      // Editing a class doesn't conflict with itself.
      await expect(
        classes.updateClassRecord(clubId, { ...at("11:00"), id: lesson.id })
      ).resolves.toMatchObject({ id: lesson.id })
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("keeps reservations off a space while a class is on", async () => {
      const { clubId, court, base } = await clubWithClasses()
      await classes.createClassRecord(clubId, {
        ...base,
        spaceId: court.id,
        startTime: "12:00",
      })
      const slot = {
        spaceId: court.id,
        date: base.date,
        startTime: "12:30",
        durationMinutes: 90,
      }
      expect(await spaces.findSpaceConflict(clubId, slot)).toMatchObject({
        kind: "class",
        startTime: "12:00",
        who: "Class Coach",
      })
      await expect(spaces.assertSpaceFree(clubId, slot)).rejects.toThrow(
        "errors.space.classConflict"
      )
      // Another space, or another day, is free.
      const [otherCourt] = (await spaces.listSpaceRecords(clubId)).filter(
        (s) => s.activityId === court.activityId && s.id !== court.id
      )
      await expect(
        spaces.assertSpaceFree(clubId, { ...slot, spaceId: otherCourt.id })
      ).resolves.toBeUndefined()
      await expect(
        spaces.assertSpaceFree(clubId, { ...slot, date: "2026-03-03" })
      ).resolves.toBeUndefined()
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("rejects a coach who doesn't teach the activity", async () => {
      const { clubId, pilates, studio, base } = await clubWithClasses()
      await db
        .delete(coachActivity)
        .where(eq(coachActivity.activityId, pilates.id))
      await expect(
        classes.createClassRecord(clubId, { ...base, spaceId: studio.id })
      ).rejects.toThrow("errors.coach.wrongActivity")
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("rejects a space whose activity has no classes", async () => {
      const { clubId, pilates, studio, base } = await clubWithClasses()
      await db
        .update(activity)
        .set({ active: false })
        .where(eq(activity.id, pilates.id))
      await expect(
        classes.createClassRecord(clubId, { ...base, spaceId: studio.id })
      ).rejects.toThrow("errors.space.wrongActivity")
      await db.delete(club).where(eq(club.id, clubId))
    })

    // Class series (recurring classes). `today` is pinned, so the 12-month
    // horizon is 2027-03-01.
    const TODAY = "2026-03-01"

    function weeklyRule(
      overrides: Partial<RecurrenceRule> = {}
    ): RecurrenceRule {
      return {
        frequency: "weekly",
        interval: 1,
        weekdays: [1],
        monthlyBy: null,
        startDate: "2026-03-02", // a Monday
        until: null,
        count: null,
        exdates: [],
        ...overrides,
      }
    }

    function seriesInput(
      fixture: Awaited<ReturnType<typeof clubWithClasses>>,
      rule: RecurrenceRule
    ) {
      const { date: _date, ...fields } = fixture.base
      return { ...fields, spaceId: fixture.studio.id, rule }
    }

    async function seriesClasses(seriesId: string) {
      return db
        .select()
        .from(coachClass)
        .where(eq(coachClass.seriesId, seriesId))
        .orderBy(coachClass.date)
    }

    async function bookStudio(clubId: string, spaceId: string, date: string) {
      await db.insert(reservation).values({
        spaceId,
        player: "Booked Player",
        bookedBy: "Front Desk",
        date,
        startTime: "10:30",
        durationMinutes: 60,
        paymentStatus: "paid",
        clubId,
      })
    }

    it("creates one class per date of a series", async () => {
      const fixture = await clubWithClasses()
      const { clubId, pilates } = fixture
      const series = await classes.createClassSeriesRecord(
        clubId,
        seriesInput(fixture, weeklyRule({ weekdays: [1, 3], count: 4 })),
        TODAY
      )
      expect(series).toMatchObject({
        activityId: pilates.id,
        capacity: 8,
        generatedUntil: "2027-03-01",
      })
      const created = await seriesClasses(series.id)
      expect(created.map((c) => [c.date, c.seriesDate])).toEqual([
        ["2026-03-02", "2026-03-02"],
        ["2026-03-04", "2026-03-04"],
        ["2026-03-09", "2026-03-09"],
        ["2026-03-11", "2026-03-11"],
      ])
      expect(created.every((c) => c.capacity === 8)).toBe(true)
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("refuses a series over a taken date, then skips it", async () => {
      const fixture = await clubWithClasses()
      const { clubId, studio } = fixture
      await bookStudio(clubId, studio.id, "2026-03-09")
      await classes.createClassRecord(clubId, {
        ...fixture.base,
        spaceId: studio.id,
        date: "2026-03-23",
      })
      const input = seriesInput(fixture, weeklyRule({ count: 4 }))
      await expect(
        classes.createClassSeriesRecord(clubId, input, TODAY)
      ).rejects.toMatchObject({
        code: "errors.class.seriesConflicts",
        params: {
          dates: "2026-03-09, 2026-03-23",
          all: "2026-03-09,2026-03-23",
        },
      })
      expect(
        await db
          .select()
          .from(classSeries)
          .where(eq(classSeries.clubId, clubId))
      ).toEqual([])

      const series = await classes.createClassSeriesRecord(
        clubId,
        {
          ...input,
          rule: { ...input.rule, exdates: ["2026-03-09", "2026-03-23"] },
        },
        TODAY
      )
      expect(series.exdates).toEqual(["2026-03-09", "2026-03-23"])
      expect((await seriesClasses(series.id)).map((c) => c.date)).toEqual([
        "2026-03-02",
        "2026-03-16",
      ])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("names the first conflicts and counts the rest", async () => {
      const fixture = await clubWithClasses()
      const { clubId, studio } = fixture
      for (const date of [
        "2026-03-02",
        "2026-03-09",
        "2026-03-16",
        "2026-03-23",
        "2026-03-30",
      ]) {
        await bookStudio(clubId, studio.id, date)
      }
      await expect(
        classes.createClassSeriesRecord(
          clubId,
          seriesInput(fixture, weeklyRule({ count: 6 })),
          TODAY
        )
      ).rejects.toMatchObject({
        code: "errors.class.seriesConflictsMore",
        params: { dates: "2026-03-02, 2026-03-09, 2026-03-16", count: 2 },
      })
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("refuses a series with no dates in the next 12 months", async () => {
      const fixture = await clubWithClasses()
      await expect(
        classes.createClassSeriesRecord(
          fixture.clubId,
          seriesInput(fixture, weeklyRule({ startDate: "2027-06-07" })),
          TODAY
        )
      ).rejects.toMatchObject({ code: "errors.class.seriesEmpty" })
      await db.delete(club).where(eq(club.id, fixture.clubId))
    })

    it("fills a never-ending series ahead, skipping taken dates", async () => {
      const fixture = await clubWithClasses()
      const { clubId, studio } = fixture
      const series = await classes.createClassSeriesRecord(
        clubId,
        seriesInput(fixture, weeklyRule()),
        TODAY
      )
      // Every Monday from 2026-03-02 to 2027-03-01.
      expect(await seriesClasses(series.id)).toHaveLength(53)

      await bookStudio(clubId, studio.id, "2027-03-15")
      await classes.fillSeriesAhead(clubId, "2026-03-20")
      await classes.fillSeriesAhead(clubId, "2026-03-20")
      const filled = await seriesClasses(series.id)
      expect(filled.slice(-2).map((c) => c.date)).toEqual([
        "2027-03-01",
        "2027-03-08",
      ])
      expect(filled).toHaveLength(54)
      const [updated] = await db
        .select()
        .from(classSeries)
        .where(eq(classSeries.id, series.id))
      expect(updated).toMatchObject({
        generatedUntil: "2027-03-20",
        exdates: ["2027-03-15"],
      })

      // The skipped date doesn't come back once the space is free again.
      await db.delete(reservation).where(eq(reservation.clubId, clubId))
      await classes.fillSeriesAhead(clubId, "2026-03-30")
      expect(
        (await seriesClasses(series.id)).slice(-4).map((c) => c.date)
      ).toEqual(["2027-03-01", "2027-03-08", "2027-03-22", "2027-03-29"])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("stops filling a series at its end", async () => {
      const fixture = await clubWithClasses()
      const series = await classes.createClassSeriesRecord(
        fixture.clubId,
        seriesInput(fixture, weeklyRule({ until: "2027-03-31" })),
        TODAY
      )
      await classes.fillSeriesAhead(fixture.clubId, "2026-09-01")
      const filled = await seriesClasses(series.id)
      expect(filled.at(-1)?.date).toBe("2027-03-29")
      expect(filled).toHaveLength(57)
      await db.delete(club).where(eq(club.id, fixture.clubId))
    })

    // Editing and deleting with a scope. By NOW the classes of 2 and 9 March
    // have ended.
    const NOW = { date: "2026-03-10", time: "12:00" }

    async function weeklySeries(overrides: Partial<RecurrenceRule> = {}) {
      const fixture = await clubWithClasses()
      const series = await classes.createClassSeriesRecord(
        fixture.clubId,
        seriesInput(fixture, weeklyRule(overrides)),
        TODAY
      )
      const created = await seriesClasses(series.id)
      return { ...fixture, series, created }
    }

    async function seriesRow(id: string) {
      const rows = await db
        .select()
        .from(classSeries)
        .where(eq(classSeries.id, id))
      return rows.at(0)
    }

    function editOf(
      fixture: Awaited<ReturnType<typeof weeklySeries>>,
      classIndex: number,
      overrides: Partial<ClassSeriesEdit> = {}
    ): ClassSeriesEdit {
      const cls = fixture.created[classIndex]
      return {
        id: cls.id,
        scope: "following",
        coachId: fixture.base.coachId,
        spaceId: fixture.studio.id,
        date: cls.date,
        startTime: cls.startTime,
        durationMinutes: cls.durationMinutes,
        capacity: cls.capacity,
        rule: seriesRuleOf(fixture.series),
        confirmed: false,
        ...overrides,
      }
    }

    function seriesRuleOf(row: schema.ClassSeries): RecurrenceRule {
      return {
        frequency: row.frequency,
        interval: row.interval,
        weekdays: row.weekdays,
        monthlyBy: row.monthlyBy,
        startDate: row.startDate,
        until: row.until,
        count: row.count,
        exdates: row.exdates,
      }
    }

    it("deletes one class of a series for good", async () => {
      const fixture = await weeklySeries({ count: 4 })
      await classes.deleteClassRecord(
        fixture.clubId,
        fixture.created[1].id,
        "this"
      )
      expect((await seriesRow(fixture.series.id))?.exdates).toEqual([
        "2026-03-09",
      ])
      await db
        .update(classSeries)
        .set({ generatedUntil: "2026-03-01" })
        .where(eq(classSeries.id, fixture.series.id))
      await classes.fillSeriesAhead(fixture.clubId, TODAY)
      expect(
        (await seriesClasses(fixture.series.id)).map((c) => c.date)
      ).toEqual(["2026-03-02", "2026-03-16", "2026-03-23"])
      await db.delete(club).where(eq(club.id, fixture.clubId))
    })

    it("deletes this and following classes, ending the series", async () => {
      const fixture = await weeklySeries()
      await classes.deleteClassRecord(
        fixture.clubId,
        fixture.created[2].id,
        "following"
      )
      expect(
        (await seriesClasses(fixture.series.id)).map((c) => c.date)
      ).toEqual(["2026-03-02", "2026-03-09"])
      expect(await seriesRow(fixture.series.id)).toMatchObject({
        until: "2026-03-15",
        count: null,
      })

      // From the first class, nothing is left: the series goes too.
      await classes.deleteClassRecord(
        fixture.clubId,
        fixture.created[0].id,
        "following"
      )
      expect(await seriesRow(fixture.series.id)).toBeUndefined()
      await db.delete(club).where(eq(club.id, fixture.clubId))
    })

    it("deletes all classes that haven't ended, keeping the history", async () => {
      const fixture = await weeklySeries()
      await classes.deleteClassRecord(
        fixture.clubId,
        fixture.created[5].id,
        "all",
        NOW
      )
      expect(
        (await seriesClasses(fixture.series.id)).map((c) => c.date)
      ).toEqual(["2026-03-02", "2026-03-09"])
      expect((await seriesRow(fixture.series.id))?.until).toBe("2026-03-09")
      await db.delete(club).where(eq(club.id, fixture.clubId))
    })

    it("edits this and following classes in place, keeping attendees", async () => {
      const fixture = await weeklySeries({ count: 4 })
      const [customer] = await customers(fixture.clubId, 1)
      await classes.addAttendeeRecord(
        fixture.clubId,
        fixture.created[2].id,
        customer
      )
      const result = await classes.updateClassSeriesRecord(
        fixture.clubId,
        editOf(fixture, 2, { startTime: "18:00", capacity: 5 }),
        NOW
      )
      expect(result).toEqual({ saved: true })
      const after = await seriesClasses(fixture.series.id)
      expect(after.map((c) => [c.date, c.startTime, c.capacity])).toEqual([
        ["2026-03-02", "10:00", 8],
        ["2026-03-09", "10:00", 8],
        ["2026-03-16", "18:00", 5],
        ["2026-03-23", "18:00", 5],
      ])
      expect(after[2].id).toBe(fixture.created[2].id)
      expect(
        await classes.listAttendeeRecords(fixture.clubId, after[2].id)
      ).toHaveLength(1)
      expect((await seriesRow(fixture.series.id))?.startTime).toBe("18:00")
      await db.delete(club).where(eq(club.id, fixture.clubId))
    })

    it("refuses an edit over a taken date or below the sign-ups", async () => {
      const fixture = await weeklySeries({ count: 4 })
      await db.insert(reservation).values({
        spaceId: fixture.studio.id,
        player: "Booked Player",
        bookedBy: "Front Desk",
        date: "2026-03-23",
        startTime: "18:00",
        durationMinutes: 60,
        paymentStatus: "paid",
        clubId: fixture.clubId,
      })
      await expect(
        classes.updateClassSeriesRecord(
          fixture.clubId,
          editOf(fixture, 2, { startTime: "18:00" }),
          NOW
        )
      ).rejects.toMatchObject({
        code: "errors.class.seriesConflicts",
        params: { all: "2026-03-23" },
      })

      const [a, b] = await customers(fixture.clubId, 2)
      await classes.addAttendeeRecord(fixture.clubId, fixture.created[3].id, a)
      await classes.addAttendeeRecord(fixture.clubId, fixture.created[3].id, b)
      await expect(
        classes.updateClassSeriesRecord(
          fixture.clubId,
          editOf(fixture, 2, { capacity: 1 }),
          NOW
        )
      ).rejects.toMatchObject({
        code: "errors.class.capacityBelowAttendees",
        params: { count: 2 },
      })
      const unchanged = await seriesClasses(fixture.series.id)
      expect(unchanged.every((c) => c.startTime === "10:00")).toBe(true)
      await db.delete(club).where(eq(club.id, fixture.clubId))
    })

    it("splits the series on a rule change, after confirming removals", async () => {
      const fixture = await weeklySeries({ count: 6 })
      const [customer] = await customers(fixture.clubId, 1)
      // 23 March survives "every 2 weeks" from 9 March; 16 March doesn't.
      await classes.addAttendeeRecord(
        fixture.clubId,
        fixture.created[2].id,
        customer
      )
      await classes.addAttendeeRecord(
        fixture.clubId,
        fixture.created[3].id,
        customer
      )
      const edit = editOf(fixture, 1, {
        rule: { ...seriesRuleOf(fixture.series), interval: 2, count: 3 },
      })
      expect(
        await classes.updateClassSeriesRecord(fixture.clubId, edit, NOW)
      ).toEqual({ saved: false, removedClasses: 2, removedSignUps: 1 })
      expect(await seriesClasses(fixture.series.id)).toHaveLength(6)

      expect(
        await classes.updateClassSeriesRecord(
          fixture.clubId,
          { ...edit, confirmed: true },
          NOW
        )
      ).toEqual({ saved: true })
      expect(await seriesRow(fixture.series.id)).toMatchObject({
        until: "2026-03-08",
        count: null,
      })
      expect(
        (await seriesClasses(fixture.series.id)).map((c) => c.date)
      ).toEqual(["2026-03-02"])
      const [next] = await db
        .select()
        .from(classSeries)
        .where(
          and(
            eq(classSeries.clubId, fixture.clubId),
            eq(classSeries.startDate, "2026-03-09")
          )
        )
      expect(next).toMatchObject({ interval: 2, count: 3 })
      const moved = await seriesClasses(next.id)
      expect(moved.map((c) => c.date)).toEqual([
        "2026-03-09",
        "2026-03-23",
        "2026-04-06",
      ])
      // The surviving class is the same row, with its attendee.
      expect(moved[1].id).toBe(fixture.created[3].id)
      expect(
        await classes.listAttendeeRecords(fixture.clubId, moved[1].id)
      ).toHaveLength(1)
      await db.delete(club).where(eq(club.id, fixture.clubId))
    })

    it("moves all classes to another day, keeping attendees and history", async () => {
      const fixture = await weeklySeries({ count: 4 })
      const [customer] = await customers(fixture.clubId, 1)
      await classes.addAttendeeRecord(
        fixture.clubId,
        fixture.created[3].id,
        customer
      )
      // Edit the 23 March class, moving it to Tuesday with "all events".
      const result = await classes.updateClassSeriesRecord(
        fixture.clubId,
        editOf(fixture, 3, {
          scope: "all",
          date: "2026-03-24",
          rule: { ...seriesRuleOf(fixture.series), weekdays: [2] },
        }),
        NOW
      )
      expect(result).toEqual({ saved: true })
      // The ended classes stay in the old series, unchanged.
      expect(
        (await seriesClasses(fixture.series.id)).map((c) => c.date)
      ).toEqual(["2026-03-02", "2026-03-09"])
      const [next] = await db
        .select()
        .from(classSeries)
        .where(
          and(
            eq(classSeries.clubId, fixture.clubId),
            eq(classSeries.startDate, "2026-03-17")
          )
        )
      const moved = await seriesClasses(next.id)
      // `count` now counts from the new start: four more Tuesdays.
      expect(moved.map((c) => [c.date, c.seriesDate])).toEqual([
        ["2026-03-17", "2026-03-17"],
        ["2026-03-24", "2026-03-24"],
        ["2026-03-31", "2026-03-31"],
        ["2026-04-07", "2026-04-07"],
      ])
      expect(moved[1].id).toBe(fixture.created[3].id)
      expect(
        await classes.listAttendeeRecords(fixture.clubId, moved[1].id)
      ).toHaveLength(1)
      await db.delete(club).where(eq(club.id, fixture.clubId))
    })

    it("signs a customer up to the following classes, skipping full ones", async () => {
      const fixture = await weeklySeries({ count: 4 })
      const { clubId, created } = fixture
      const [ana, ben] = await customers(clubId, 2)
      await db
        .update(coachClass)
        .set({ capacity: 1 })
        .where(eq(coachClass.id, created[2].id))
      await classes.addAttendeeRecord(clubId, created[2].id, ben)

      expect(
        await classes.addSeriesAttendeeRecord(clubId, created[1].id, ana)
      ).toEqual({ classes: 2, full: ["2026-03-16"] })
      const signedUp = async (classId: string) =>
        (await classes.listAttendeeRecords(clubId, classId)).map(
          (a) => a.playerId
        )
      expect(await signedUp(created[0].id)).toEqual([])
      expect(await signedUp(created[1].id)).toEqual([ana])
      expect(await signedUp(created[2].id)).toEqual([ben])
      expect(await signedUp(created[3].id)).toEqual([ana])

      // Signing up again changes nothing; removing takes them off from there.
      await classes.addSeriesAttendeeRecord(clubId, created[1].id, ana)
      expect(await signedUp(created[3].id)).toEqual([ana])
      await classes.removeSeriesAttendeeRecord(clubId, created[3].id, ana)
      expect(await signedUp(created[1].id)).toEqual([ana])
      expect(await signedUp(created[3].id)).toEqual([])
      await db.delete(club).where(eq(club.id, clubId))
    })
  })

  describe("coach activities (coaches.server)", () => {
    const loadCoaches = () => import("@/lib/coaches.server")
    let coaches: Awaited<ReturnType<typeof loadCoaches>>

    beforeAll(async () => {
      coaches = await loadCoaches()
    })

    const person = { name: "Coach", phone: "+54 9 11 5000 0003" }

    // A throwaway club with the given activities, inserted directly.
    // Deleting the club cascades.
    async function clubWith(...templateKeys: string[]) {
      const clubId = randomUUID()
      await db
        .insert(club)
        .values({ id: clubId, name: `Club ${clubId}`, slug: `club-${clubId}` })
      const rows = await db
        .insert(activity)
        .values(
          templateKeys.map((templateKey, sortOrder) => ({
            clubId,
            templateKey,
            sortOrder,
          }))
        )
        .returning()
      const ids = Object.fromEntries(rows.map((r) => [r.templateKey, r.id]))
      return { clubId, ids }
    }

    it("gives a new coach the club's only activity with classes", async () => {
      const { clubId, ids } = await clubWith("padel")
      const created = await coaches.createCoachRecord(clubId, person)
      expect(created.activityIds).toEqual([ids.padel])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("needs the activities when the club has several", async () => {
      const { clubId, ids } = await clubWith("padel", "pilates")
      await expect(coaches.createCoachRecord(clubId, person)).rejects.toThrow(
        "errors.coach.activityRequired"
      )
      await expect(
        coaches.createCoachRecord(clubId, { ...person, activityIds: [] })
      ).rejects.toThrow("errors.coach.activityRequired")
      const created = await coaches.createCoachRecord(clubId, {
        ...person,
        activityIds: [ids.pilates],
      })
      const [listed] = await coaches.listCoachRecords(clubId)
      expect(listed).toMatchObject({
        id: created.id,
        activityIds: [ids.pilates],
      })
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("rejects another club's activity", async () => {
      const { clubId } = await clubWith("padel")
      const other = await clubWith("padel")
      await expect(
        coaches.createCoachRecord(clubId, {
          ...person,
          activityIds: [other.ids.padel],
        })
      ).rejects.toThrow("errors.activity.notFound")
      expect(await coaches.listCoachRecords(clubId)).toEqual([])
      await db.delete(club).where(eq(club.id, clubId))
      await db.delete(club).where(eq(club.id, other.clubId))
    })

    it("keeps a disabled activity when the others are edited", async () => {
      const { clubId, ids } = await clubWith("padel", "pilates")
      const created = await coaches.createCoachRecord(clubId, {
        ...person,
        activityIds: [ids.padel, ids.pilates],
      })
      await db
        .update(activity)
        .set({ active: false })
        .where(eq(activity.id, ids.pilates))

      const updated = await coaches.updateCoachRecord(clubId, {
        ...person,
        id: created.id,
        activityIds: [ids.padel],
      })
      expect(updated?.activityIds.sort()).toEqual(
        [ids.padel, ids.pilates].sort()
      )

      // Leaving activities out keeps them as they are.
      const renamed = await coaches.updateCoachRecord(clubId, {
        ...person,
        name: "Renamed",
        id: created.id,
      })
      expect(renamed?.activityIds).toHaveLength(2)
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("drops activities a coach no longer teaches", async () => {
      const { clubId, ids } = await clubWith("padel", "pilates")
      const created = await coaches.createCoachRecord(clubId, {
        ...person,
        activityIds: [ids.padel, ids.pilates],
      })
      const updated = await coaches.updateCoachRecord(clubId, {
        ...person,
        id: created.id,
        activityIds: [ids.pilates],
      })
      expect(updated?.activityIds).toEqual([ids.pilates])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("doesn't update another club's coach", async () => {
      const { clubId } = await clubWith("padel")
      const other = await clubWith("padel")
      const created = await coaches.createCoachRecord(clubId, person)
      expect(
        await coaches.updateCoachRecord(other.clubId, {
          ...person,
          name: "Hijacked",
          id: created.id,
        })
      ).toBeUndefined()
      await db.delete(club).where(eq(club.id, clubId))
      await db.delete(club).where(eq(club.id, other.clubId))
    })
  })

  describe("space types (spaces.server)", () => {
    const loadSpaces = () => import("@/lib/spaces.server")
    let spaces: Awaited<ReturnType<typeof loadSpaces>>

    beforeAll(async () => {
      spaces = await loadSpaces()
    })

    // A throwaway club with padel and pilates, inserted directly. Deleting the
    // club cascades.
    async function padelAndPilatesClub() {
      const clubId = randomUUID()
      await db
        .insert(club)
        .values({ id: clubId, name: `Club ${clubId}`, slug: `club-${clubId}` })
      const [padel, pilates] = await db
        .insert(activity)
        .values([
          { clubId, templateKey: "padel", sortOrder: 0 },
          { clubId, templateKey: "pilates", sortOrder: 1 },
        ])
        .returning()
      await spaces.seedDefaultSpaces(clubId)
      return { clubId, padelId: padel.id, pilatesId: pilates.id }
    }

    async function spacesOf(clubId: string, activityId: string) {
      return (await spaces.listSpaceRecords(clubId)).filter(
        (s) => s.activityId === activityId
      )
    }

    it("gives each activity its default spaces, once", async () => {
      const { clubId, padelId, pilatesId } = await padelAndPilatesClub()
      await spaces.seedDefaultSpaces(clubId)

      const courts = await spacesOf(clubId, padelId)
      expect(courts.map((s) => s.name)).toEqual([
        "Court 1",
        "Court 2",
        "Court 3",
        "Court 4",
      ])
      expect(new Set(courts.map((s) => s.type))).toEqual(new Set(["court"]))
      expect(await spacesOf(clubId, pilatesId)).toMatchObject([
        { name: "Studio 1", type: "studio", sortOrder: 1, indoor: true },
      ])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("counts pre-activity spaces as the bookings activity's own", async () => {
      const clubId = randomUUID()
      await db
        .insert(club)
        .values({ id: clubId, name: `Club ${clubId}`, slug: `club-${clubId}` })
      await db
        .insert(space)
        .values({ clubId, name: "Court 1", sortOrder: 1, activityId: null })
      await spaces.seedDefaultSpaces(clubId)
      expect(await spaces.listSpaceRecords(clubId)).toHaveLength(1)
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("numbers and names new spaces within their activity", async () => {
      const { clubId, pilatesId } = await padelAndPilatesClub()
      const created = await spaces.createSpaceRecord(clubId, {
        activityId: pilatesId,
        indoor: true,
        active: true,
      })
      expect(created).toMatchObject({
        name: "Studio 2",
        type: "studio",
        sortOrder: 2,
        activityId: pilatesId,
      })
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("rejects a type the activity doesn't use", async () => {
      const { clubId, pilatesId } = await padelAndPilatesClub()
      await expect(
        spaces.createSpaceRecord(clubId, {
          activityId: pilatesId,
          type: "court",
          indoor: true,
          active: true,
        })
      ).rejects.toThrow("errors.space.wrongType")
      const [studio] = await spacesOf(clubId, pilatesId)
      await expect(
        spaces.updateSpaceRecord(clubId, { id: studio.id, type: "court" })
      ).rejects.toThrow("errors.space.wrongType")
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("rejects another club's activity", async () => {
      const { clubId, pilatesId } = await padelAndPilatesClub()
      await expect(
        spaces.createSpaceRecord(CLUB_B_ID, {
          activityId: pilatesId,
          indoor: true,
          active: true,
        })
      ).rejects.toThrow("errors.activity.notFound")
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("only lets a space be used for its activity's blocks", async () => {
      const { clubId, padelId, pilatesId } = await padelAndPilatesClub()
      const [court] = await spacesOf(clubId, padelId)
      const [studio] = await spacesOf(clubId, pilatesId)

      // Pilates has classes but no bookings.
      await expect(
        spaces.assertSpaceBookable(clubId, studio.id, "bookings")
      ).rejects.toThrow("errors.space.wrongActivity")
      await expect(
        spaces.assertSpaceBookable(clubId, studio.id, "sessions")
      ).resolves.toMatchObject({ id: pilatesId })
      await expect(
        spaces.assertSpaceBookable(clubId, court.id, "bookings")
      ).resolves.toMatchObject({ id: padelId })

      // A disabled activity's spaces can't be used at all.
      await db
        .update(activity)
        .set({ active: false })
        .where(eq(activity.id, pilatesId))
      await expect(
        spaces.assertSpaceBookable(clubId, studio.id, "sessions")
      ).rejects.toThrow("errors.space.wrongActivity")
      await db.delete(club).where(eq(club.id, clubId))
    })
  })

  describe("activities (activities.server)", () => {
    const loadActivities = () => import("@/lib/activities.server")
    let activities: Awaited<ReturnType<typeof loadActivities>>

    beforeAll(async () => {
      activities = await loadActivities()
    })

    // A throwaway club per test; deleting it cascades to its activities.
    async function freshClub(): Promise<string> {
      const id = randomUUID()
      await db
        .insert(club)
        .values({ id, name: `Club ${id}`, slug: `club-${id}` })
      return id
    }

    async function activitiesOf(clubId: string) {
      return db.select().from(activity).where(eq(activity.clubId, clubId))
    }

    it("backfills padel for clubs that existed before migration 0011", async () => {
      const rows = await activitiesOf(CLUB_ID)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ templateKey: "padel", active: true })
      // Carried over from the club's default booking length (90 by default).
      expect(rows[0].config).toEqual({ bookings: { defaultDuration: 90 } })
    })

    it("gives a club without activities padel, idempotently", async () => {
      const clubId = await freshClub()
      await activities.ensureDefaultActivities(clubId)
      await activities.ensureDefaultActivities(clubId)
      const rows = await activitiesOf(clubId)
      expect(rows.map((r) => r.templateKey)).toEqual(["padel"])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("does not add padel to a club that already has an activity", async () => {
      const clubId = await freshClub()
      await db.insert(activity).values({ clubId, templateKey: "pilates" })
      await activities.ensureDefaultActivities(clubId)
      const rows = await activitiesOf(clubId)
      expect(rows.map((r) => r.templateKey)).toEqual(["pilates"])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("provisions padel when a club is created", async () => {
      const { createClubRecord } = await import("@/lib/clubs.server")
      const created = await createClubRecord({
        name: `Provisioned ${randomUUID()}`,
        status: "active",
      })
      const list = await activities.listActivityRecords(created.id)
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ templateKey: "padel", active: true })
      expect(list[0].config.bookings?.defaultDuration).toBe(90)
      await db.delete(club).where(eq(club.id, created.id))
    })

    it("skips rows for templates this build doesn't know", async () => {
      const clubId = await freshClub()
      await db.insert(activity).values([
        { clubId, templateKey: "padel" },
        { clubId, templateKey: "quidditch" },
      ])
      const list = await activities.listActivityRecords(clubId)
      expect(list.map((a) => a.templateKey)).toEqual(["padel"])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("renames an activity and clears the name back to the default", async () => {
      const clubId = await freshClub()
      const [row] = await db
        .insert(activity)
        .values({ clubId, templateKey: "padel" })
        .returning()
      const renamed = await activities.renameActivityRecord(clubId, {
        id: row.id,
        name: "  Pádel Pro  ",
      })
      expect(renamed.name).toBe("Pádel Pro")
      const cleared = await activities.renameActivityRecord(clubId, {
        id: row.id,
        name: "   ",
      })
      expect(cleared.name).toBeNull()
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("refuses to rename another club's activity", async () => {
      const [own] = await activitiesOf(CLUB_ID)
      await expect(
        activities.renameActivityRecord(CLUB_B_ID, { id: own.id, name: "x" })
      ).rejects.toThrow(/errors\.activity\.notFound/)
      const [after] = await activitiesOf(CLUB_ID)
      expect(after.name).toBeNull()
    })

    describe("setActivityEnabled (platform API)", () => {
      it("creates the activity on first enable, after existing ones", async () => {
        const clubId = await freshClub()
        await db
          .insert(activity)
          .values({ clubId, templateKey: "pilates", sortOrder: 4 })
        const result = await activities.setActivityEnabled(
          clubId,
          "padel",
          true
        )
        expect(result).toMatchObject({
          ok: true,
          activity: { templateKey: "padel", active: true, sortOrder: 5 },
        })
        // Enabling again is a no-op.
        await activities.setActivityEnabled(clubId, "padel", true)
        const rows = await activitiesOf(clubId)
        expect(rows.filter((r) => r.templateKey === "padel")).toHaveLength(1)
        await db.delete(club).where(eq(club.id, clubId))
      })

      // Unfinished templates (available: false) are covered by the
      // enableRefusal unit tests; every template is available today.
      it("rejects unknown templates", async () => {
        const clubId = await freshClub()
        expect(
          await activities.setActivityEnabled(clubId, "quidditch", true)
        ).toEqual({ ok: false, reason: "unknownTemplate" })
        await db.delete(club).where(eq(club.id, clubId))
      })

      it("adds pilates next to padel, once", async () => {
        const clubId = await freshClub()
        const first = await activities.setActivityEnabled(
          clubId,
          "pilates",
          true
        )
        expect(first).toMatchObject({
          ok: true,
          created: true,
          activity: { templateKey: "pilates", active: true, sortOrder: 1 },
        })
        expect(
          await activities.setActivityEnabled(clubId, "pilates", true)
        ).toMatchObject({ ok: true, created: false })
        expect(
          (await activities.listActivityRecords(clubId)).map(
            (a) => a.templateKey
          )
        ).toEqual(["padel", "pilates"])
        await db.delete(club).where(eq(club.id, clubId))
      })

      it("keeps at least one activity enabled", async () => {
        const clubId = await freshClub()
        expect(
          await activities.setActivityEnabled(clubId, "padel", false)
        ).toEqual({ ok: false, reason: "lastActive" })

        // With another active activity, disabling padel is allowed.
        await db.insert(activity).values({ clubId, templateKey: "pilates" })
        const disabled = await activities.setActivityEnabled(
          clubId,
          "padel",
          false
        )
        expect(disabled).toMatchObject({
          ok: true,
          activity: { active: false },
        })
        await db.delete(club).where(eq(club.id, clubId))
      })

      it("reports disabling an activity the club doesn't have", async () => {
        const clubId = await freshClub()
        // pilates is unfinished, but disabling is still checked and allowed.
        expect(
          await activities.setActivityEnabled(clubId, "pilates", false)
        ).toEqual({ ok: false, reason: "notFound" })
        await db.delete(club).where(eq(club.id, clubId))
      })
    })
  })

  describe("customers, profiles and spaces (P1)", () => {
    const loadPlayers = () => import("@/lib/players.server")
    const loadSpaces = () => import("@/lib/spaces.server")
    let players: Awaited<ReturnType<typeof loadPlayers>>
    let spaces: Awaited<ReturnType<typeof loadSpaces>>
    let padelId: string

    const base = {
      email: "p@example.com",
      phone: "600000000",
      age: 30,
      gender: "Male" as const,
    }

    beforeAll(async () => {
      players = await loadPlayers()
      spaces = await loadSpaces()
      const [padel] = await db
        .select()
        .from(activity)
        .where(
          and(eq(activity.clubId, CLUB_ID), eq(activity.templateKey, "padel"))
        )
      padelId = padel.id
    })

    it("links courts without an activity to the club's padel activity", async () => {
      await db
        .update(space)
        .set({ activityId: null })
        .where(eq(space.id, COURT1_ID))
      const list = await spaces.listSpaceRecords(CLUB_ID)
      expect(list.find((c) => c.id === COURT1_ID)?.activityId).toBe(padelId)
    })

    it("stores a player's level in their padel profile", async () => {
      const created = await players.createPlayerRecord(CLUB_ID, {
        ...base,
        fullName: "Level Player",
        category: "C5",
      })
      const [profile] = await db
        .select()
        .from(customerActivityProfile)
        .where(eq(customerActivityProfile.customerId, created.id))
      expect(profile).toMatchObject({ activityId: padelId, level: "C5" })

      await players.updatePlayerRecord(CLUB_ID, {
        id: created.id,
        ...base,
        fullName: "Level Player",
        category: "C4",
      })
      const profiles = await db
        .select()
        .from(customerActivityProfile)
        .where(eq(customerActivityProfile.customerId, created.id))
      expect(profiles.map((p) => p.level)).toEqual(["C4"])
    })

    it("lists the profile level, or none without a profile", async () => {
      await players.createPlayerRecord(CLUB_ID, {
        ...base,
        fullName: "Has Profile",
        category: "C6",
      })
      await db.insert(player).values({
        ...base,
        fullName: "No Profile",
        clubId: CLUB_ID,
      })
      const list = await players.listPlayerRecords(CLUB_ID)
      const levelOf = (name: string) =>
        list.find((p) => p.fullName === name)?.category
      expect(levelOf("Has Profile")).toBe("C6")
      expect(levelOf("No Profile")).toBeNull()
    })

    it("matches a booking name to exactly one customer", async () => {
      const ana = await players.createPlayerRecord(CLUB_ID, {
        ...base,
        fullName: "Ana Ruiz",
        category: "C5",
      })
      expect(await players.findCustomerIdByName(CLUB_ID, "  ana ruiz ")).toBe(
        ana.id
      )
      expect(await players.findCustomerIdByName(CLUB_ID, "Ana")).toBeNull()
      // Another club never matches.
      expect(
        await players.findCustomerIdByName(CLUB_B_ID, "Ana Ruiz")
      ).toBeNull()

      // Two players with the same name are ambiguous.
      await players.createPlayerRecord(CLUB_ID, {
        ...base,
        fullName: "ANA RUIZ",
        category: "C6",
      })
      expect(await players.findCustomerIdByName(CLUB_ID, "Ana Ruiz")).toBeNull()
    })

    it("removes the profile and unlinks bookings when a player is deleted", async () => {
      const gone = await players.createPlayerRecord(CLUB_ID, {
        ...base,
        fullName: "Leaving Player",
        category: "C5",
      })
      const [booking] = await db
        .insert(reservation)
        .values({
          spaceId: COURT1_ID,
          player: "Leaving Player",
          customerId: gone.id,
          bookedBy: "Front Desk",
          date: "2026-01-01",
          startTime: "10:00",
          durationMinutes: 90,
          paymentStatus: "paid",
          clubId: CLUB_ID,
        })
        .returning()

      await players.deletePlayerRecord(CLUB_ID, gone.id)

      const profiles = await db
        .select()
        .from(customerActivityProfile)
        .where(eq(customerActivityProfile.customerId, gone.id))
      expect(profiles).toHaveLength(0)
      const [after] = await db
        .select()
        .from(reservation)
        .where(eq(reservation.id, booking.id))
      expect(after).toMatchObject({
        customerId: null,
        player: "Leaving Player",
      })
    })

    it("gives a new club's courts its padel activity", async () => {
      const { createClubRecord } = await import("@/lib/clubs.server")
      const created = await createClubRecord({
        name: `Spaces ${randomUUID()}`,
        status: "active",
      })
      const [clubPadel] = await db
        .select()
        .from(activity)
        .where(eq(activity.clubId, created.id))
      const rows = await db
        .select()
        .from(space)
        .where(eq(space.clubId, created.id))
      expect(rows).toHaveLength(4)
      expect(new Set(rows.map((r) => r.activityId))).toEqual(
        new Set([clubPadel.id])
      )
      await db.delete(space).where(eq(space.clubId, created.id))
      await db.delete(club).where(eq(club.id, created.id))
    })

    it("deletes a provisioned club with its activities and courts", async () => {
      const { createClubRecord, deleteClubRecord } =
        await import("@/lib/clubs.server")
      const created = await createClubRecord({
        name: `Doomed ${randomUUID()}`,
        status: "active",
      })
      await deleteClubRecord(created.id)
      expect(await activitiesOfClub(created.id)).toHaveLength(0)
      const rows = await db
        .select()
        .from(space)
        .where(eq(space.clubId, created.id))
      expect(rows).toHaveLength(0)
    })

    async function activitiesOfClub(clubId: string) {
      return db.select().from(activity).where(eq(activity.clubId, clubId))
    }
  })

  // Exercises the DB-backed per-player concurrency rule in
  // reservation-settings.server.ts (the pure window/cutoff rules are unit-tested
  // separately in reservation-settings.test.ts).
  describe("customer activities (players.server)", () => {
    const loadPlayers = () => import("@/lib/players.server")
    const loadActivities = () => import("@/lib/activities.server")
    let players: Awaited<ReturnType<typeof loadPlayers>>
    let activities: Awaited<ReturnType<typeof loadActivities>>

    beforeAll(async () => {
      players = await loadPlayers()
      activities = await loadActivities()
    })

    const person = {
      email: "c@example.com",
      phone: "600000000",
      age: 30,
      gender: "Female" as const,
    }

    // A throwaway club with padel and pilates. Deleting the club cascades.
    async function padelAndPilatesClub() {
      const clubId = randomUUID()
      await db
        .insert(club)
        .values({ id: clubId, name: `Club ${clubId}`, slug: `club-${clubId}` })
      const [padel, pilates] = await db
        .insert(activity)
        .values([
          { clubId, templateKey: "padel", sortOrder: 0 },
          { clubId, templateKey: "pilates", sortOrder: 1 },
        ])
        .returning()
      return { clubId, padelId: padel.id, pilatesId: pilates.id }
    }

    it("lists each activity's own customers", async () => {
      const { clubId, padelId, pilatesId } = await padelAndPilatesClub()
      await players.createPlayerRecord(
        clubId,
        { ...person, fullName: "Padel Only", category: "D5" },
        padelId
      )
      const student = await players.createPlayerRecord(
        clubId,
        // A level sent for an activity without levels is dropped.
        { ...person, fullName: "Pilates Only", category: "D5" },
        pilatesId
      )
      expect(student.category).toBeNull()

      const names = async (activityId?: string) =>
        (await players.listPlayerRecords(clubId, activityId)).map(
          (p) => p.fullName
        )
      expect(await names(padelId)).toEqual(["Padel Only"])
      expect(await names(pilatesId)).toEqual(["Pilates Only"])
      // Without an activity: everyone, e.g. to sign someone up to a class.
      expect(await names()).toEqual(["Padel Only", "Pilates Only"])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("needs a level for an activity with levels, and an active activity", async () => {
      const { clubId, padelId, pilatesId } = await padelAndPilatesClub()
      await expect(
        players.createPlayerRecord(
          clubId,
          { ...person, fullName: "No Level", category: null },
          padelId
        )
      ).rejects.toThrow("errors.activity.levelRequired")
      await db
        .update(activity)
        .set({ active: false })
        .where(eq(activity.id, pilatesId))
      await expect(
        players.createPlayerRecord(
          clubId,
          { ...person, fullName: "Off", category: null },
          pilatesId
        )
      ).rejects.toThrow("errors.activity.notFound")
      // Nothing was saved by either refusal.
      expect(await players.listPlayerRecords(clubId)).toEqual([])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("removes from one list, and deletes once in none", async () => {
      const { clubId, padelId, pilatesId } = await padelAndPilatesClub()
      const both = await players.createPlayerRecord(
        clubId,
        { ...person, fullName: "Both", category: "D6" },
        padelId
      )
      await players.updatePlayerRecord(
        clubId,
        { id: both.id, ...person, fullName: "Both", category: null },
        pilatesId
      )
      // Saving from the students list keeps the padel level.
      const [inPadel] = await players.listPlayerRecords(clubId, padelId)
      expect(inPadel.category).toBe("D6")

      expect(
        await players.removePlayerFromActivity(clubId, both.id, pilatesId)
      ).toEqual({ id: both.id, deleted: false })
      expect(await players.listPlayerRecords(clubId, pilatesId)).toEqual([])
      expect(await players.listPlayerRecords(clubId, padelId)).toHaveLength(1)

      expect(
        await players.removePlayerFromActivity(clubId, both.id, padelId)
      ).toEqual({ id: both.id, deleted: true })
      expect(await players.listPlayerRecords(clubId)).toEqual([])
      await db.delete(club).where(eq(club.id, clubId))
    })

    it("puts a club's existing customers in the default activity it gets", async () => {
      const clubId = randomUUID()
      await db
        .insert(club)
        .values({ id: clubId, name: `Club ${clubId}`, slug: `club-${clubId}` })
      await db
        .insert(player)
        .values({ ...person, fullName: "Legacy", clubId, gender: "Male" })
      await activities.ensureDefaultActivities(clubId)
      const [padel] = await activities.listActivityRecords(clubId)
      expect(
        (await players.listPlayerRecords(clubId, padel.id)).map(
          (p) => p.fullName
        )
      ).toEqual(["Legacy"])
      await db.delete(club).where(eq(club.id, clubId))
    })
  })

  describe("per-player booking limit (reservation-settings.server)", () => {
    const loadSettings = () => import("@/lib/reservation-settings.server")
    let settingsServer: Awaited<ReturnType<typeof loadSettings>>

    // A weekday a few days out: comfortably inside the advance window and on an
    // open day (default hours close only on Sunday).
    function futureOpenDate(daysAhead = 5): string {
      const d = new Date()
      d.setDate(d.getDate() + daysAhead)
      if (d.getDay() === 0) d.setDate(d.getDate() + 1)
      return d.toISOString().slice(0, 10)
    }

    const PLAYER = "Concurrency Player"

    beforeAll(async () => {
      settingsServer = await loadSettings()
      // Pin a known rule set so the window checks pass and the limit is 2.
      await settingsServer.upsertReservationSettingsRecord(CLUB_ID, {
        maxConcurrentPerPlayer: 2,
        minAdvanceHours: 1,
        maxAdvanceDays: 30,
      })
    })

    async function seedUpcoming(date: string) {
      return db
        .insert(reservation)
        .values([
          {
            spaceId: COURT1_ID,
            player: PLAYER,
            bookedBy: "Front Desk",
            date,
            startTime: "10:00",
            durationMinutes: 60,
            paymentStatus: "paid",
            clubId: CLUB_ID,
          },
          {
            spaceId: COURT2_ID,
            player: PLAYER,
            bookedBy: "Front Desk",
            date,
            startTime: "11:00",
            durationMinutes: 60,
            paymentStatus: "paid",
            clubId: CLUB_ID,
          },
        ])
        .returning({ id: reservation.id })
    }

    it("rejects a booking that exceeds the per-player limit", async () => {
      const date = futureOpenDate()
      await seedUpcoming(date)
      await expect(
        settingsServer.assertBookingAllowed(CLUB_ID, {
          player: PLAYER,
          date,
          startTime: "12:00",
          durationMinutes: 60,
        })
      ).rejects.toThrow(/errors\.booking\.concurrency/)
    })

    it("does not count the reservation being edited against the limit", async () => {
      const date = futureOpenDate()
      const [first] = await seedUpcoming(date)
      // Editing one of the two existing bookings: excluding itself leaves 1 < 2.
      await expect(
        settingsServer.assertBookingAllowed(
          CLUB_ID,
          { player: PLAYER, date, startTime: "12:00", durationMinutes: 60 },
          { excludeId: first.id }
        )
      ).resolves.toBeUndefined()
    })
  })
})
