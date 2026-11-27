import { test, expect } from "@playwright/test"
import { PLATFORM_API_KEY } from "./helpers"

// Default Club, created by migration 0004.
const CLUB_ID = "00000000-0000-0000-0000-000000000001"
// North Branch (seeded): pilates is enabled there, away from the Default Club
// the other specs use.
const NORTH_CLUB_ID = "00000000-0000-0000-0000-000000000002"
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
    expect.objectContaining({ key: "pilates", available: true })
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

  const pilates = await request.put(
    `/api/platform/clubs/${NORTH_CLUB_ID}/activities/pilates`,
    { headers: auth, data: { active: true } }
  )
  expect(pilates.status()).toBe(200)
  expect(await pilates.json()).toMatchObject({
    templateKey: "pilates",
    active: true,
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

test.describe("club endpoints", () => {
  const CLUBS = "/api/platform/clubs"

  test("hide without the platform key, even from a signed-in Owner", async ({
    page,
  }) => {
    // page.request carries the Owner's session cookie.
    const variants: Record<string, string>[] = [
      {},
      { authorization: "Bearer wrong-key" },
    ]
    for (const headers of variants) {
      const calls = [
        page.request.get(CLUBS, { headers }),
        page.request.post(CLUBS, { headers, data: { name: "Nope" } }),
        page.request.get(`${CLUBS}/${CLUB_ID}`, { headers }),
        page.request.patch(`${CLUBS}/${CLUB_ID}`, {
          headers,
          data: { name: "Nope" },
        }),
        page.request.delete(`${CLUBS}/${CLUB_ID}`, { headers }),
      ]
      for (const res of await Promise.all(calls)) {
        expect(res.status()).toBe(404)
      }
    }
    expect((await page.request.get("/api/clubs")).status()).toBe(404)
  })

  test("create, rename and delete a club", async ({ page, request }) => {
    const name = `E2E Platform Club ${Date.now()}`
    const created = await request.post(CLUBS, {
      headers: auth,
      data: { name },
    })
    expect(created.status()).toBe(201)
    const club = (await created.json()) as { id: string; status: string }
    expect(club).toMatchObject({ name, status: "active", memberCount: 0 })

    // Provisioned with its default activity.
    const activities = await request.get(`${CLUBS}/${club.id}/activities`, {
      headers: auth,
    })
    expect((await activities.json()).activities).toContainEqual(
      expect.objectContaining({ templateKey: "padel", active: true })
    )

    const list = await request.get(CLUBS, { headers: auth })
    expect(await list.json()).toContainEqual(
      expect.objectContaining({ id: club.id })
    )

    const renamed = await request.patch(`${CLUBS}/${club.id}`, {
      headers: auth,
      data: { name: `${name} (renamed)` },
    })
    expect(renamed.status()).toBe(200)
    expect(await renamed.json()).toMatchObject({ name: `${name} (renamed)` })
    expect(
      (
        await request.patch(`${CLUBS}/${club.id}`, {
          headers: auth,
          data: { name: "" },
        })
      ).status()
    ).toBe(400)

    // A member who belongs to no other club blocks the delete.
    const member = await page.request.post("/api/users", {
      data: {
        name: "E2E Platform Member",
        email: `platform-${Date.now()}@e2e.test`,
        role: "Owner",
        password: "Sup3rSecret1",
        clubIds: [club.id],
      },
    })
    expect(member.status()).toBe(201)
    const memberId = ((await member.json()) as { id: string }).id
    expect(
      (await request.delete(`${CLUBS}/${club.id}`, { headers: auth })).status()
    ).toBe(409)

    expect((await page.request.delete(`/api/users/${memberId}`)).status()).toBe(
      200
    )
    const deleted = await request.delete(`${CLUBS}/${club.id}`, {
      headers: auth,
    })
    expect(deleted.status()).toBe(200)
    expect(await deleted.json()).toEqual({ id: club.id })
    expect(
      (await request.get(`${CLUBS}/${club.id}`, { headers: auth })).status()
    ).toBe(404)
  })

  test("never deletes the Default Club", async ({ request }) => {
    const res = await request.delete(`${CLUBS}/${CLUB_ID}`, { headers: auth })
    expect(res.status()).toBe(409)
  })
})
