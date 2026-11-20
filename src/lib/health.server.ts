import { pool } from "@/db"

const CHECK_TIMEOUT_MS = 2000

/** Pings Postgres with `select 1`, giving up after CHECK_TIMEOUT_MS. */
export async function checkDatabase(): Promise<"up" | "down"> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS)
  })
  try {
    await Promise.race([pool.query("select 1"), timeout])
    return "up"
  } catch {
    return "down"
  } finally {
    clearTimeout(timer)
  }
}
