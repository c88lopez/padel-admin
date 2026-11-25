import { describe, expect, it } from "vitest"
import { AppError, appErrorPayload, errorMessage } from "./errors"

describe("AppError", () => {
  it("serializes its code, message and params into the message", () => {
    const err = new AppError("errors.booking.tooSoon", "Muy pronto", {
      hours: 2,
    })
    expect(err.code).toBe("errors.booking.tooSoon")
    expect(err.params).toEqual({ hours: 2 })
    expect(JSON.parse(err.message)).toMatchObject({
      __appError: true,
      code: "errors.booking.tooSoon",
      message: "Muy pronto",
      params: { hours: 2 },
    })
  })
})

describe("errorMessage", () => {
  it("shows an AppError's own message, also after crossing to the client", () => {
    const thrown = new AppError("errors.reservation.conflict", "Ocupado (Ana)")
    expect(errorMessage(thrown)).toBe("Ocupado (Ana)")
    expect(errorMessage(new Error(thrown.message), "fallback")).toBe(
      "Ocupado (Ana)"
    )
  })

  it("falls back to the provided fallback for a non-AppError", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("fallback")
  })

  it("uses the raw message when there is no fallback", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom")
  })

  it("uses a generic message for non-Error values with no fallback", () => {
    expect(errorMessage("nope")).toBe("Algo salió mal")
  })
})

describe("appErrorPayload", () => {
  it("reads the code and params of a serialized AppError", () => {
    const crossed = new Error(
      new AppError("errors.class.seriesConflicts", "Ocupado", {
        all: "2026-03-09",
      }).message
    )
    expect(appErrorPayload(crossed)).toEqual({
      code: "errors.class.seriesConflicts",
      params: { all: "2026-03-09" },
    })
  })

  it("is null for other errors", () => {
    expect(appErrorPayload(new Error("boom"))).toBeNull()
    expect(appErrorPayload("boom")).toBeNull()
  })
})
