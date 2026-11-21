import { createServerFn } from "@tanstack/react-start"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { reservation, space } from "@/db/schema"
import {
  currentClubId,
  requireClubId,
  requirePermission,
  resolveActiveClubId,
} from "@/lib/auth.server"
import { assertSpaceBookable, assertSpaceFree } from "@/lib/spaces.server"
import { findCustomerIdByName } from "@/lib/players.server"
import {
  assertBookingAllowed,
  assertCancellationAllowed,
} from "@/lib/reservation-settings.server"
import { AppError } from "@/lib/errors"

const reservationInput = z.object({
  spaceId: z.string().min(1),
  player: z.string().min(1),
  date: z.string().min(1), // "YYYY-MM-DD"
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.coerce.number().int().min(15).max(360),
  paymentStatus: z.enum(["paid", "partial", "unpaid"]),
})

// Reservation enriched with its court's display name/number for the UI.
export interface ReservationListItem {
  id: string
  spaceId: string
  spaceName: string
  spaceType: string
  spaceNumber: number
  player: string
  bookedBy: string
  date: string
  startTime: string
  durationMinutes: number
  paymentStatus: string
}

export const listReservations = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReservationListItem[]> => {
    const clubId = await currentClubId()
    return db
      .select({
        id: reservation.id,
        spaceId: reservation.spaceId,
        spaceName: space.name,
        spaceType: space.type,
        spaceNumber: space.sortOrder,
        player: reservation.player,
        bookedBy: reservation.bookedBy,
        date: reservation.date,
        startTime: reservation.startTime,
        durationMinutes: reservation.durationMinutes,
        paymentStatus: reservation.paymentStatus,
      })
      .from(reservation)
      .innerJoin(space, eq(reservation.spaceId, space.id))
      .where(eq(reservation.clubId, clubId))
      .orderBy(
        asc(reservation.date),
        asc(space.sortOrder),
        asc(reservation.startTime)
      )
  }
)

export const createReservation = createServerFn({ method: "POST" })
  .validator((data: unknown) => reservationInput.parse(data))
  .handler(async ({ data }) => {
    const session = await requirePermission("reservations:manage")
    const clubId = await resolveActiveClubId(session.user)
    if (!clubId) throw new AppError("errors.clubContextRequired")
    await assertSpaceBookable(clubId, data.spaceId, "bookings")
    await assertBookingAllowed(clubId, data)
    await assertSpaceFree(clubId, data)
    const [created] = await db
      .insert(reservation)
      .values({
        ...data,
        customerId: await findCustomerIdByName(clubId, data.player),
        bookedBy: session.user.name,
        clubId,
      })
      .returning()
    return created
  })

export const updateReservation = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    reservationInput.extend({ id: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) => {
    const clubId = await requireClubId("reservations:manage")
    const { id, ...values } = data
    await assertSpaceBookable(clubId, values.spaceId, "bookings")
    await assertBookingAllowed(clubId, values, { excludeId: id })
    await assertSpaceFree(clubId, values, { reservationId: id })
    const [updated] = await db
      .update(reservation)
      .set({
        ...values,
        customerId: await findCustomerIdByName(clubId, values.player),
      })
      .where(and(eq(reservation.id, id), eq(reservation.clubId, clubId)))
      .returning()
    return updated
  })

export const deleteReservation = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ id: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) => {
    const clubId = await requireClubId("reservations:manage")
    const existing = await db
      .select({
        date: reservation.date,
        startTime: reservation.startTime,
      })
      .from(reservation)
      .where(and(eq(reservation.id, data.id), eq(reservation.clubId, clubId)))
      .limit(1)
    if (existing.length > 0)
      await assertCancellationAllowed(clubId, existing[0])
    await db
      .delete(reservation)
      .where(and(eq(reservation.id, data.id), eq(reservation.clubId, clubId)))
    return { id: data.id }
  })
