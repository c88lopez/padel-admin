import { test, expect } from "@playwright/test"
import { PLATFORM_API_KEY } from "./helpers"

// Default Club, created by migration 0004.
const CLUB_ID = "00000000-0000-0000-0000-000000000001"
const BASE = `/api/platform/clubs/${CLUB_ID}/activities`
const auth = { authorization: `Bearer ${PLATFORM_API_KEY}` }

test("hides the platform API without the platform key", async ({ request }) => {
  const variants: Record<string, string>[] = [
    {},
    { authorization: "Bearer wrong-key" },
  ]
  for (const headers of variants) {
    expect((await request.get(BASE, { headers })).status()).toBe(404)
    const put = await request.put(`${BASE}/padel`, {
      headers,
      data: { active: true },
    })
    expect(put.status()).toBe(404)
  }
})

test("lists the club's activities and the templates", async ({ request }) => {
  const res = await request.get(BASE, { headers: auth })
  expect(res.status()).toBe(200)
  const body = (await res.json()) as {
    activities: { templateKey: string; active: boolean }[]
    templates: { key: string; available: boolean }[]
  }
  expect(body.activities).toContainEqual(
    expect.objectContaining({ templateKey: "padel", active: true })
  )
  expect(body.templates).toContainEqual(
    expect.objectContaining({ key: "pilates", available: false })
  )
})

test("enforces the activity rules", async ({ request }) => {
  const put = (templateKey: string, data: unknown) =>
    request.put(`${BASE}/${templateKey}`, { headers: auth, data })

  // Enabling an enabled activity is a no-op.
  const enabled = await put("padel", { active: true })
  expect(enabled.status()).toBe(200)
  expect(await enabled.json()).toMatchObject({
    templateKey: "padel",
    active: true,
  })

  const unfinished = await put("pilates", { active: true })
  expect(unfinished.status()).toBe(409)
  expect(await unfinished.json()).toEqual({
    error: "This activity isn't available yet.",
  })

  const lastActive = await put("padel", { active: false })
  expect(lastActive.status()).toBe(409)

  expect((await put("quidditch", { active: true })).status()).toBe(404)
  expect((await put("padel", { active: "yes" })).status()).toBe(400)

  const unknownClub = await request.put(
    "/api/platform/clubs/no-such-club/activities/padel",
    { headers: auth, data: { active: true } }
  )
  expect(unknownClub.status()).toBe(404)
  expect(await unknownClub.json()).toEqual({ error: "Club not found." })
})
