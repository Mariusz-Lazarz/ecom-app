import { withErrorHandler } from "@/lib/api/handler"
import { query } from "@/lib/db"
import { ServiceUnavailableError } from "@/lib/errors"
import { checkStorage } from "@/lib/storage"

export const GET = withErrorHandler(async () => {
  const [db, storage] = await Promise.allSettled([query<{ now: Date }>("SELECT now()"), checkStorage()])
  if (db.status === "rejected") throw new ServiceUnavailableError("Database is unreachable", { cause: db.reason })
  if (storage.status === "rejected") {
    throw new ServiceUnavailableError("Media storage is unreachable", { cause: storage.reason })
  }
  return Response.json({ status: "ok", db: "up", storage: "up", time: db.value.rows[0].now })
})
