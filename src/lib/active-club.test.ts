import { describe, expect, it } from "vitest"
import { chooseActiveClub } from "@/lib/active-club"

describe("chooseActiveClub", () => {
  it("returns the default club when none is selected", () => {
    expect(chooseActiveClub(["club-a", "club-b"], undefined)).toBe("club-a")
  })

  it("returns the selected club when the user belongs to it", () => {
    expect(chooseActiveClub(["club-a", "club-b"], "club-b")).toBe("club-b")
  })

  it("ignores a selected club the user doesn't belong to", () => {
    expect(chooseActiveClub(["club-a", "club-b"], "club-c")).toBe("club-a")
  })

  it("returns null for a user without clubs", () => {
    expect(chooseActiveClub([], "club-a")).toBeNull()
  })
})
