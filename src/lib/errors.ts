// Shared, dependency-free error model. Server functions throw `AppError` with a
// stable `code`, the message to show the user, and optional `params` the client
// can act on. All three are serialized into the Error `message` so they survive
// the server→client boundary, where `errorMessage` reads the message back. API
// routes keep their own English JSON contract (see api-auth.ts) and don't use
// this.

export type ErrorParams = Record<string, string | number>

interface SerializedAppError {
  __appError: true
  code: string
  message: string
  params?: ErrorParams
}

export class AppError extends Error {
  code: string
  userMessage: string
  params?: ErrorParams

  constructor(code: string, message: string, params?: ErrorParams) {
    super(JSON.stringify({ __appError: true, code, message, params }))
    this.name = "AppError"
    this.code = code
    this.userMessage = message
    this.params = params
  }
}

function parsePayload(message: string): SerializedAppError | null {
  try {
    const parsed: unknown = JSON.parse(message)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "__appError" in parsed &&
      parsed.__appError === true
    ) {
      return parsed as SerializedAppError
    }
  } catch {
    // Not an AppError payload (a plain Error or sanitized message).
  }
  return null
}

/** The code and params of a thrown AppError, also after crossing to the client. */
export function appErrorPayload(
  error: unknown
): { code: string; params?: ErrorParams } | null {
  const payload = parsePayload(error instanceof Error ? error.message : "")
  return payload && { code: payload.code, params: payload.params }
}

/**
 * The message to show for a thrown error. Errors thrown as `AppError` carry
 * their own message; anything else falls back to the provided `fallback`, then
 * the raw message, then a generic message.
 */
export function errorMessage(error: unknown, fallback?: string): string {
  const message = error instanceof Error ? error.message : ""
  const payload = parsePayload(message)
  if (payload) return payload.message
  return fallback ?? (message || "Algo salió mal")
}
