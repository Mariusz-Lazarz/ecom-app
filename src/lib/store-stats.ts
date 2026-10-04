import "server-only"

import { connection } from "next/server"

import { query } from "@/lib/db"

/**
 * The store-wide figures shown in the home page hero, read live from orders and reviews.
 *
 * - `happyCustomers`: customers with at least one delivered order.
 * - `averageDeliveryDays`: mean time from placing an order to its `delivered` event, in days,
 *   over every delivered order; null without any.
 * - `rating`: the average of all published reviews, rounded to one decimal; null without any.
 */
export type StoreStats = {
  happyCustomers: number
  averageDeliveryDays: number | null
  rating: number | null
}

type StoreStatsRow = {
  happy_customers: number
  average_delivery_days: string | null
  rating: string | null
}

export async function getStoreStats(): Promise<StoreStats> {
  await connection()
  const { rows } = await query<StoreStatsRow>(
    `SELECT
       (SELECT count(DISTINCT user_id)::int FROM orders WHERE status = 'delivered') AS happy_customers,
       (SELECT avg(EXTRACT(EPOCH FROM (e.created_at - o.created_at)) / 86400)
          FROM orders o
          JOIN LATERAL (
            SELECT created_at FROM order_status_events
             WHERE order_id = o.id AND status = 'delivered'
             ORDER BY created_at DESC LIMIT 1
          ) e ON true
         WHERE o.status = 'delivered') AS average_delivery_days,
       (SELECT round(avg(rating), 1) FROM reviews WHERE status = 'published') AS rating`
  )
  const row = rows[0]
  return {
    happyCustomers: row.happy_customers,
    averageDeliveryDays:
      row.average_delivery_days === null ? null : Number(row.average_delivery_days),
    rating: row.rating === null ? null : Number(row.rating),
  }
}
