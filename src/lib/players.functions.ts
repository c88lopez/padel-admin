import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { currentClubId, requireClubId } from "@/lib/auth.server"
import {
  createPlayerRecord,
  deletePlayerRecord,
  listPlayerRecords,
  updatePlayerRecord,
} from "@/lib/players.server"

export type { PlayerRecord } from "@/lib/players.server"

const playerInput = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  age: z.coerce.number().int().min(5).max(99),
  gender: z.enum(["Male", "Female"]),
  category: z.string().min(1),
})

export const listPlayers = createServerFn({ method: "GET" }).handler(async () =>
  listPlayerRecords(await currentClubId())
)

export const createPlayer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => playerInput.parse(data))
  .handler(async ({ data }) =>
    createPlayerRecord(await requireClubId("players:manage"), data)
  )

export const updatePlayer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    playerInput.extend({ id: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) =>
    updatePlayerRecord(await requireClubId("players:manage"), data)
  )

export const deletePlayer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) =>
    deletePlayerRecord(await requireClubId("players:manage"), data.id)
  )
