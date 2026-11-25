import { describe, expect, it } from "vitest"
import { roleLabel } from "./users"

describe("roleLabel", () => {
  it("labels stored role values in Spanish", () => {
    expect(roleLabel("Coach")).toBe("Entrenador")
    expect(roleLabel("Front Desk")).toBe("Recepcionista")
  })

  it("passes unknown roles through", () => {
    expect(roleLabel("Janitor")).toBe("Janitor")
  })
})
