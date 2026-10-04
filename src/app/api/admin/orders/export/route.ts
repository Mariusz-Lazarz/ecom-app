import * as z from "zod"

import { auth } from "@/auth"
import { withErrorHandler } from "@/lib/api/handler"
import { toCsv } from "@/lib/csv"
import { BadRequestError, NotFoundError, UnauthorizedError } from "@/lib/errors"
import { listOrdersForExport } from "@/lib/orders"
import { OrderExportQuerySchema } from "@/lib/validation/orders"
import { searchParamsToObject } from "@/lib/validation/products"

const ORDERS_CSV_HEADER = [
  "number",
  "date",
  "customer_name",
  "customer_email",
  "status",
  "items",
  "subtotal",
  "discount_code",
  "discount",
  "shipping",
  "total",
  "currency",
] as const

/** Cents as a plain decimal amount ("1234.50"), which spreadsheets read as a number. */
const amount = (cents: number) => (cents / 100).toFixed(2)

/**
 * GET /api/admin/orders/export?status=&q=&from=&to= — the matching orders as a CSV download,
 * oldest first (`from` / `to` are UTC days, both inclusive). Admins only: 401 when signed out, 404
 * for other users, like the admin pages; 400 `bad_request` for invalid filters.
 */
export const GET = withErrorHandler(async (request) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()
  if (session.user.role !== "admin") throw new NotFoundError()

  const parsed = OrderExportQuerySchema.safeParse(searchParamsToObject(new URL(request.url).searchParams))
  if (!parsed.success) {
    throw new BadRequestError("Invalid query parameters.", { fieldErrors: z.flattenError(parsed.error).fieldErrors })
  }

  const orders = await listOrdersForExport(parsed.data)
  const csv = toCsv([
    [...ORDERS_CSV_HEADER],
    ...orders.map((order) => [
      order.number,
      order.createdAt.toISOString(),
      order.customerName,
      order.customerEmail,
      order.status,
      order.itemCount,
      amount(order.subtotalCents),
      order.discountCode,
      amount(order.discountCents),
      amount(order.shippingCents),
      amount(order.totalCents),
      order.currency,
    ]),
  ])
  const date = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
