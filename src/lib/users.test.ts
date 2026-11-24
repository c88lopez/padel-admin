import { describe, expect, it } from "vitest"
import i18n from "@/lib/i18n"
import { roleLabel } from "./users"

describe("roleLabel", () => {
  it("translates stored role values", () => {
    const es = i18n.getFixedT("es")
    expect(roleLabel(es, "Coach")).toBe("Entrenador")
    expect(roleLabel(es, "Front Desk")).toBe("Recepcionista")
    expect(roleLabel(i18n.getFixedT("en"), "Front Desk")).toBe("Front Desk")
  })

  it("passes unknown roles through", () => {
    expect(roleLabel(i18n.getFixedT("es"), "Janitor")).toBe("Janitor")
  })
})
