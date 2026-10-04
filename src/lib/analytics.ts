import "server-only"

import {
  addUtcDays,
  fillDailySeries,
  previousRange,
  startOfUtcDay,
  type AnalyticsPeriod,
  type DailyPoint,
  type DayRange,
} from "@/lib/admin-analytics"
import { query } from "@/lib/db"
import { NON_REVENUE_STATUSES, ORDER_STATUSES, type OrderStatus } from "@/lib/order-rules"

/**
 * Sales analytics for the admin area, read straight from the orders and their item snapshots.
 *
 * Revenue is the sum of order totals (what customers paid, discounts and shipping included) of
 * orders that still stand: cancelled and rejected orders count for neither revenue nor the order
 * count, but do show in the orders-by-status breakdown. Product and category figures use the
 * item snapshots' line totals (before discounts and shipping). Days are UTC days. Callers check
 * the admin role.
 */

export const STORE_CURRENCY = "USD"
export const TOP_LIMIT = 5
export const DELETED_PRODUCTS_LABEL = "Deleted products"

export type AnalyticsTotals = {
  revenueCents: number
  orders: number
  // Revenue / orders, rounded to the cent; 0 without orders.
  averageOrderCents: number
  // Customers whose first standing order falls in the period.
  newCustomers: number
}

export type TopProduct = {
  // null once the product has been deleted (its snapshot name is kept).
  productId: string | null
  name: string
  brand: string
  units: number
  revenueCents: number
}

export type CategorySales = {
  // null for lines whose product was deleted, grouped as `DELETED_PRODUCTS_LABEL`.
  categoryId: string | null
  name: string
  units: number
  revenueCents: number
}

export type DiscountCodeUsage = { code: string; orders: number; discountCents: number }

export type AnalyticsReport = {
  // The days reported on; for all time it starts on the first order's day.
  range: DayRange
  // The period of equal length just before, compared against; null for all time.
  previous: DayRange | null
  currency: string
  totals: AnalyticsTotals
  previousTotals: AnalyticsTotals | null
  // One entry per UTC day of `range`, zeros included.
  daily: DailyPoint[]
  topByUnits: TopProduct[]
  topByRevenue: TopProduct[]
  // Highest sales first.
  categories: CategorySales[]
  // Every order placed in the range, whatever its status.
  statusCounts: Record<OrderStatus, number>
  discounts: { totalCents: number; orders: number; topCodes: DiscountCodeUsage[] }
}

const excluded = [...NON_REVENUE_STATUSES]

// $1 from, $2 to, $3 the excluded statuses.
const STANDING_IN_RANGE = "o.created_at >= $1 AND o.created_at < $2 AND o.status <> ALL($3::text[])"

/** Where a period starts: its own `from`, or the first order's UTC day (today without orders). */
async function resolveRange(period: AnalyticsPeriod): Promise<DayRange> {
  if (period.from) return { from: period.from, to: period.to }
  const { rows } = await query<{ first: Date | null }>("SELECT min(created_at) AS first FROM orders")
  const first = rows[0]?.first
  const from = first ? startOfUtcDay(first) : addUtcDays(period.to, -1)
  return { from: from < period.to ? from : addUtcDays(period.to, -1), to: period.to }
}

async function totalsFor(range: DayRange): Promise<AnalyticsTotals> {
  const [money, customers] = await Promise.all([
    query<{ orders: number; revenue: string }>(
      `SELECT count(*)::int AS orders, COALESCE(sum(o.total_cents), 0)::bigint AS revenue
       FROM orders o WHERE ${STANDING_IN_RANGE}`,
      [range.from, range.to, excluded],
    ),
    query<{ count: number }>(
      `SELECT count(*)::int AS count FROM (
         SELECT min(o.created_at) AS first FROM orders o
         WHERE o.status <> ALL($3::text[]) GROUP BY o.user_id
       ) f
       WHERE f.first >= $1 AND f.first < $2`,
      [range.from, range.to, excluded],
    ),
  ])
  const orders = money.rows[0].orders
  const revenueCents = Number(money.rows[0].revenue)
  return {
    revenueCents,
    orders,
    averageOrderCents: orders === 0 ? 0 : Math.round(revenueCents / orders),
    newCustomers: customers.rows[0].count,
  }
}

/** Revenue and standing orders per UTC day of the range, empty days as zeros. */
export async function getDailySales(range: DayRange): Promise<DailyPoint[]> {
  const { rows } = await query<{ day: string; orders: number; revenue: string }>(
    `SELECT to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            count(*)::int AS orders, sum(o.total_cents)::bigint AS revenue
     FROM orders o WHERE ${STANDING_IN_RANGE}
     GROUP BY 1`,
    [range.from, range.to, excluded],
  )
  return fillDailySeries(
    rows.map((row) => ({ date: row.day, orders: row.orders, revenueCents: Number(row.revenue) })),
    range,
    { orders: 0, revenueCents: 0 },
  )
}

type ProductRow = { product_id: string | null; name: string; brand: string; units: string; revenue: string }

async function topProducts(range: DayRange, by: "units" | "revenue"): Promise<TopProduct[]> {
  const order = by === "units" ? "units DESC, revenue DESC" : "revenue DESC, units DESC"
  // Deleted products are told apart by their snapshot slug; the name is the latest snapshot's.
  const { rows } = await query<ProductRow>(
    `SELECT oi.product_id,
            (array_agg(oi.product_name ORDER BY o.created_at DESC))[1] AS name,
            (array_agg(oi.brand ORDER BY o.created_at DESC))[1] AS brand,
            sum(oi.quantity)::bigint AS units, sum(oi.line_total_cents)::bigint AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE ${STANDING_IN_RANGE}
     GROUP BY oi.product_id, CASE WHEN oi.product_id IS NULL THEN oi.product_slug END
     ORDER BY ${order}, name
     LIMIT ${TOP_LIMIT}`,
    [range.from, range.to, excluded],
  )
  return rows.map((row) => ({
    productId: row.product_id,
    name: row.name,
    brand: row.brand,
    units: Number(row.units),
    revenueCents: Number(row.revenue),
  }))
}

async function categorySales(range: DayRange): Promise<CategorySales[]> {
  const { rows } = await query<{ id: string | null; name: string | null; units: string; revenue: string }>(
    `SELECT c.id, c.name, sum(oi.quantity)::bigint AS units, sum(oi.line_total_cents)::bigint AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${STANDING_IN_RANGE}
     GROUP BY c.id, c.name
     ORDER BY revenue DESC, c.name NULLS LAST`,
    [range.from, range.to, excluded],
  )
  return rows.map((row) => ({
    categoryId: row.id,
    name: row.name ?? DELETED_PRODUCTS_LABEL,
    units: Number(row.units),
    revenueCents: Number(row.revenue),
  }))
}

async function statusCounts(range: DayRange): Promise<Record<OrderStatus, number>> {
  const { rows } = await query<{ status: OrderStatus; count: number }>(
    `SELECT status, count(*)::int AS count FROM orders
     WHERE created_at >= $1 AND created_at < $2 GROUP BY status`,
    [range.from, range.to],
  )
  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<OrderStatus, number>
  for (const row of rows) counts[row.status] = row.count
  return counts
}

async function discountUsage(range: DayRange): Promise<AnalyticsReport["discounts"]> {
  const { rows } = await query<{ code: string; orders: number; discount: string }>(
    `SELECT o.discount_code AS code, count(*)::int AS orders, sum(o.discount_cents)::bigint AS discount
     FROM orders o WHERE ${STANDING_IN_RANGE} AND o.discount_code IS NOT NULL
     GROUP BY o.discount_code
     ORDER BY discount DESC, orders DESC, code`,
    [range.from, range.to, excluded],
  )
  const codes = rows.map((row) => ({ code: row.code, orders: row.orders, discountCents: Number(row.discount) }))
  return {
    totalCents: codes.reduce((sum, code) => sum + code.discountCents, 0),
    orders: codes.reduce((sum, code) => sum + code.orders, 0),
    topCodes: codes.slice(0, TOP_LIMIT),
  }
}

/**
 * Everything the analytics page shows for a period: totals (and the previous period's, when the
 * period has a start), daily revenue and orders, top products, sales by category, orders by
 * status and discount use.
 */
export async function getAnalytics(period: AnalyticsPeriod): Promise<AnalyticsReport> {
  const range = await resolveRange(period)
  const previous = period.from ? previousRange(range) : null
  const [totals, previousTotals, daily, topByUnits, topByRevenue, categories, counts, discounts] = await Promise.all([
    totalsFor(range),
    previous ? totalsFor(previous) : null,
    getDailySales(range),
    topProducts(range, "units"),
    topProducts(range, "revenue"),
    categorySales(range),
    statusCounts(range),
    discountUsage(range),
  ])
  return {
    range,
    previous,
    currency: STORE_CURRENCY,
    totals,
    previousTotals,
    daily,
    topByUnits,
    topByRevenue,
    categories,
    statusCounts: counts,
    discounts,
  }
}

export type RevenueTrend = {
  range: DayRange
  daily: DailyPoint[]
  revenueCents: number
  previousRevenueCents: number
  currency: string
}

/** The dashboard's revenue card: daily revenue over a range and the total against the period before. */
export async function getRevenueTrend(range: DayRange): Promise<RevenueTrend> {
  const previous = previousRange(range)
  const [daily, before] = await Promise.all([
    getDailySales(range),
    query<{ revenue: string }>(
      `SELECT COALESCE(sum(o.total_cents), 0)::bigint AS revenue FROM orders o WHERE ${STANDING_IN_RANGE}`,
      [previous.from, previous.to, excluded],
    ),
  ])
  return {
    range,
    daily,
    revenueCents: daily.reduce((sum, day) => sum + day.revenueCents, 0),
    previousRevenueCents: Number(before.rows[0].revenue),
    currency: STORE_CURRENCY,
  }
}
