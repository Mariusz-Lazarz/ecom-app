import { withErrorHandler } from "@/lib/api/handler"
import { query } from "@/lib/db"
import { ServiceUnavailableError } from "@/lib/errors"

export const GET = withErrorHandler(async () => {
  try {
    const { rows } = await query<{ now: Date }>("SELECT now()")
    return Response.json({ status: "ok", db: "up", time: rows[0].now })
  } catch (err) {
    throw new ServiceUnavailableError("Database is unreachable", { cause: err })
  }
})
