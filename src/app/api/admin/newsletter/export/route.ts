import { auth } from "@/auth"
import { withErrorHandler } from "@/lib/api/handler"
import { toCsv } from "@/lib/csv"
import { NotFoundError, UnauthorizedError } from "@/lib/errors"
import { listSubscribedForExport } from "@/lib/newsletter"

/**
 * The subscribed newsletter addresses as a CSV download (email, source, subscribed_at), oldest
 * first. Admins only: 401 when signed out, 404 for other users, like the admin pages.
 */
export const GET = withErrorHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()
  if (session.user.role !== "admin") throw new NotFoundError()

  const subscribers = await listSubscribedForExport()
  const csv = toCsv([
    ["email", "source", "subscribed_at"],
    ...subscribers.map((s) => [s.email, s.source, s.updatedAt.toISOString()]),
  ])
  const date = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="newsletter-subscribers-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
