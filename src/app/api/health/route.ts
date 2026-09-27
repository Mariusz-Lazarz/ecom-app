import { query } from "@/lib/db"

export async function GET() {
  try {
    const { rows } = await query<{ now: Date }>("SELECT now()")
    return Response.json({ status: "ok", db: "up", time: rows[0].now })
  } catch (err) {
    console.error("Health check failed", err)
    return Response.json({ status: "error", db: "down" }, { status: 503 })
  }
}
