import type { OrderStatus } from "@/lib/order-rules"
import { DEFAULT_ORDERS_PAGE_SIZE, OrderListQuerySchema, type OrderListQuery } from "@/lib/validation/orders"

// Pure helpers for the admin order pages (/admin, /admin/orders). Client-safe.

export const ADMIN_ORDERS_PATH = "/admin/orders"

const DEFAULTS = OrderListQuerySchema.parse({})

/**
 * Reads the admin order list's `searchParams`. A param that fails validation is dropped and falls
 * back to its default, so a bad link (`?status=lost&page=0`) still shows the list.
 */
export function parseAdminOrderQuery(searchParams: Record<string, string | string[] | undefined>): OrderListQuery {
  const input: Record<string, unknown> = { ...searchParams }
  let result = OrderListQuerySchema.safeParse(input)
  if (!result.success) {
    for (const issue of result.error.issues) delete input[String(issue.path[0])]
    result = OrderListQuerySchema.safeParse(input)
  }
  const { status, q, page, pageSize } = result.success ? result.data : DEFAULTS
  return { status, q, page, pageSize }
}

/** A link to the admin order list with these filters; defaults are left out. */
export function adminOrdersHref(query: Partial<OrderListQuery> = {}) {
  const params = new URLSearchParams()
  if (query.status) params.set("status", query.status)
  if (query.q) params.set("q", query.q)
  if (query.pageSize && query.pageSize !== DEFAULT_ORDERS_PAGE_SIZE) params.set("pageSize", String(query.pageSize))
  if (query.page && query.page > 1) params.set("page", String(query.page))
  const search = params.toString()
  return search ? `${ADMIN_ORDERS_PATH}?${search}` : ADMIN_ORDERS_PATH
}

/** What the button that moves an order into each status says. */
export const STATUS_ACTION_LABELS: Record<OrderStatus, string> = {
  pending: "Mark as pending",
  processing: "Start processing",
  shipped: "Mark as shipped",
  delivered: "Mark as delivered",
  cancelled: "Cancel order",
  rejected: "Reject order",
}

const TRACKING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"
export const TRACKING_PREFIX = "NC1Z"
const TRACKING_SUFFIX_LENGTH = 12

/** A made-up tracking number for the demo: `NC1Z` and 12 capital letters or digits. */
export function generateTrackingNumber(random: () => number = Math.random) {
  let suffix = ""
  for (let i = 0; i < TRACKING_SUFFIX_LENGTH; i++) {
    suffix += TRACKING_ALPHABET[Math.floor(random() * TRACKING_ALPHABET.length) % TRACKING_ALPHABET.length]
  }
  return TRACKING_PREFIX + suffix
}
