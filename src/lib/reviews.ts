import "server-only"

import { query, withTransaction } from "@/lib/db"
import { ForbiddenError, NotFoundError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import type { Page } from "@/lib/orders"
import { escapeLike } from "@/lib/products"
import {
  emptyRatingCounts,
  reviewerName,
  summarizeRatings,
  type RatingStar,
  type RatingSummary,
} from "@/lib/review-utils"
import type { AdminReviewListQuery, ReviewInput, ReviewSort, ReviewStatus } from "@/lib/validation/reviews"

/**
 * Product reviews: one per customer per product, written and edited by customers who have a
 * delivered order containing the product, and moderated (hidden, unhidden, deleted) by admins.
 *
 * products.rating and products.review_count are derived from the published reviews by a database
 * trigger (db/migrations/007_create_reviews.sql), in the same transaction as every write here.
 *
 * None of these read the session: callers (Server Actions, pages) pass the user id and check roles.
 */

const log = logger.child({ scope: "reviews" })

/** A review as the storefront shows it. */
export type PublicReview = {
  id: string
  rating: number
  title: string
  body: string
  // First name and last initial.
  author: string
  verified: boolean
  createdAt: Date
  updatedAt: Date
}

/** The signed-in customer's own review of a product, whatever its status. */
export type OwnReview = PublicReview & { status: ReviewStatus }

export type AdminReview = {
  id: string
  rating: number
  title: string
  body: string
  status: ReviewStatus
  verified: boolean
  createdAt: Date
  product: { id: string; name: string; slug: string }
  author: { id: string; name: string; email: string }
}

/** The user has no delivered order containing the product. Nothing was written. */
export class NotEligibleToReviewError extends ForbiddenError {
  constructor() {
    super("Only customers who received this product can review it.")
  }
}

type ReviewRow = {
  id: string
  rating: number
  title: string
  body: string
  status: ReviewStatus
  verified: boolean
  created_at: Date
  updated_at: Date
  first_name: string
  last_name: string
}

const toPublic = (row: ReviewRow): PublicReview => ({
  id: row.id,
  rating: row.rating,
  title: row.title,
  body: row.body,
  author: reviewerName(row.first_name, row.last_name),
  verified: row.verified,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const REVIEW_COLUMNS = `r.id, r.rating, r.title, r.body, r.status, r.verified, r.created_at, r.updated_at,
  u.first_name, u.last_name`

// Every ORDER BY ends with the id, so "Show more" never repeats or skips a review when values tie.
const ORDER_BY: Record<ReviewSort, string> = {
  newest: "r.created_at DESC, r.id",
  highest: "r.rating DESC, r.created_at DESC, r.id",
  lowest: "r.rating ASC, r.created_at DESC, r.id",
}

const DELIVERED_PURCHASE = `EXISTS (
  SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
  WHERE o.user_id = $1 AND oi.product_id = $2 AND o.status = 'delivered')`

/** Whether the user may review the product: they have a delivered order containing it. */
export async function canReview(userId: string, productId: string): Promise<boolean> {
  const { rows } = await query<{ eligible: boolean }>(`SELECT ${DELIVERED_PURCHASE} AS eligible`, [userId, productId])
  return rows[0].eligible
}

/** Average, count and per-star distribution of the product's published reviews. */
export async function getReviewSummary(productId: string): Promise<RatingSummary> {
  const { rows } = await query<{ rating: RatingStar; count: number }>(
    `SELECT rating, count(*)::int AS count FROM reviews
     WHERE product_id = $1 AND status = 'published' GROUP BY rating`,
    [productId],
  )
  const counts = emptyRatingCounts()
  for (const row of rows) counts[row.rating] = row.count
  return summarizeRatings(counts)
}

/** The first `limit` published reviews of the product in this order, and how many there are. */
export async function listProductReviews(
  productId: string,
  { sort = "newest", limit = 5 }: { sort?: ReviewSort; limit?: number } = {},
): Promise<{ items: PublicReview[]; total: number }> {
  const [{ rows }, { rows: count }] = await Promise.all([
    query<ReviewRow>(
      `SELECT ${REVIEW_COLUMNS} FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.product_id = $1 AND r.status = 'published'
       ORDER BY ${ORDER_BY[sort]}
       LIMIT $2`,
      [productId, Math.max(1, Math.trunc(limit))],
    ),
    query<{ total: number }>(
      "SELECT count(*)::int AS total FROM reviews WHERE product_id = $1 AND status = 'published'",
      [productId],
    ),
  ])
  return { items: rows.map(toPublic), total: count[0].total }
}

/** The user's own review of the product (published or hidden), or null. */
export async function getUserReview(userId: string, productId: string): Promise<OwnReview | null> {
  const { rows } = await query<ReviewRow>(
    `SELECT ${REVIEW_COLUMNS} FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.user_id = $1 AND r.product_id = $2`,
    [userId, productId],
  )
  const row = rows[0]
  return row ? { ...toPublic(row), status: row.status } : null
}

/** Which of these products the user has already reviewed. */
export async function listReviewedProductIds(userId: string, productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set()
  const { rows } = await query<{ product_id: string }>(
    "SELECT product_id FROM reviews WHERE user_id = $1 AND product_id = ANY($2::uuid[])",
    [userId, productIds],
  )
  return new Set(rows.map((row) => row.product_id))
}

/**
 * Writes the user's review of the product, or replaces their existing one (one per customer per
 * product). An edit keeps the review's moderation status. The product's rating and review count
 * are updated in the same transaction.
 *
 * @throws NotFoundError when there's no such product.
 * @throws NotEligibleToReviewError when the user has no delivered order containing it.
 */
export async function saveReview(
  userId: string,
  productId: string,
  input: ReviewInput,
): Promise<{ id: string; created: boolean }> {
  const result = await withTransaction(async (client) => {
    const { rows: products } = await client.query<{ eligible: boolean }>(
      `SELECT ${DELIVERED_PURCHASE} AS eligible FROM products WHERE id = $2`,
      [userId, productId],
    )
    if (products.length === 0) throw new NotFoundError("This product no longer exists.")
    if (!products[0].eligible) throw new NotEligibleToReviewError()

    const { rows } = await client.query<{ id: string; created: boolean }>(
      `INSERT INTO reviews (product_id, user_id, rating, title, body, verified)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (product_id, user_id) DO UPDATE
         SET rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body,
             verified = EXCLUDED.verified, seeded = false, updated_at = now()
       RETURNING id, (xmax = 0) AS created`,
      [productId, userId, input.rating, input.title, input.body],
    )
    return rows[0]
  })
  log.info(result.created ? "Review written" : "Review edited", { reviewId: result.id, productId, userId })
  return result
}

/**
 * Deletes the user's own review of the product.
 *
 * @throws NotFoundError when they haven't reviewed it.
 */
export async function deleteOwnReview(userId: string, productId: string): Promise<void> {
  const { rowCount } = await query("DELETE FROM reviews WHERE user_id = $1 AND product_id = $2", [userId, productId])
  if (!rowCount) throw new NotFoundError("You haven't reviewed this product.")
  log.info("Review deleted by its author", { productId, userId })
}

// ── Admin ────────────────────────────────────────────────────────────────────────────────────────

type AdminRow = ReviewRow & {
  product_id: string
  product_name: string
  product_slug: string
  user_id: string
  email: string
  total_count: number
}

const toAdmin = (row: AdminRow): AdminReview => ({
  id: row.id,
  rating: row.rating,
  title: row.title,
  body: row.body,
  status: row.status,
  verified: row.verified,
  createdAt: row.created_at,
  product: { id: row.product_id, name: row.product_name, slug: row.product_slug },
  author: { id: row.user_id, name: `${row.first_name} ${row.last_name}`, email: row.email },
})

const ADMIN_SELECT = `SELECT ${REVIEW_COLUMNS}, p.id AS product_id, p.name AS product_name, p.slug AS product_slug,
  u.id AS user_id, u.email
  FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id`

/** Every review, newest first, for the admin list. Filters combine with AND. */
export async function listAdminReviews(options: Partial<AdminReviewListQuery> = {}): Promise<Page<AdminReview>> {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 20), 1), 100)
  const page = Math.max(Math.trunc(options.page ?? 1), 1)
  const where: string[] = []
  const params: unknown[] = []
  if (options.status) {
    params.push(options.status)
    where.push(`r.status = $${params.length}`)
  }
  if (options.rating) {
    params.push(options.rating)
    where.push(`r.rating = $${params.length}`)
  }
  const q = options.q?.trim()
  if (q) {
    params.push(`%${escapeLike(q)}%`)
    const p = `$${params.length}`
    where.push(
      `(p.name ILIKE ${p} OR u.email ILIKE ${p} OR (u.first_name || ' ' || u.last_name) ILIKE ${p} OR r.title ILIKE ${p})`,
    )
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

  const [{ rows }, { rows: count }] = await Promise.all([
    query<AdminRow>(
      `${ADMIN_SELECT} ${whereSql}
       ORDER BY r.created_at DESC, r.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    ),
    query<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id ${whereSql}`,
      params,
    ),
  ])
  const total = count[0].total
  return { items: rows.map(toAdmin), page, pageSize, total, pageCount: Math.ceil(total / pageSize) }
}

/** How many reviews are in each status. */
export async function getReviewStatusCounts(): Promise<Record<ReviewStatus, number>> {
  const { rows } = await query<{ status: ReviewStatus; count: number }>(
    "SELECT status, count(*)::int AS count FROM reviews GROUP BY status",
  )
  const counts: Record<ReviewStatus, number> = { published: 0, hidden: 0 }
  for (const row of rows) counts[row.status] = row.count
  return counts
}

/** The most recent reviews (any status), for the admin dashboard. */
export async function listLatestReviews(limit = 5): Promise<AdminReview[]> {
  const { rows } = await query<AdminRow>(`${ADMIN_SELECT} ORDER BY r.created_at DESC, r.id LIMIT $1`, [
    Math.min(Math.max(Math.trunc(limit), 1), 50),
  ])
  return rows.map(toAdmin)
}

/**
 * Publishes or hides a review (moderation). The product's rating and review count follow in the
 * same transaction.
 *
 * @throws NotFoundError when there's no such review.
 */
export async function setReviewStatus(
  id: string,
  status: ReviewStatus,
): Promise<{ id: string; status: ReviewStatus; productSlug: string }> {
  const { rows } = await query<{ id: string; status: ReviewStatus; product_slug: string }>(
    `UPDATE reviews r SET status = $2, updated_at = now()
     FROM products p WHERE r.id = $1 AND p.id = r.product_id
     RETURNING r.id, r.status, p.slug AS product_slug`,
    [id, status],
  )
  const row = rows[0]
  if (!row) throw new NotFoundError("This review no longer exists.")
  log.info("Review moderated", { reviewId: id, status })
  return { id: row.id, status: row.status, productSlug: row.product_slug }
}

/**
 * Deletes any review (admin). The product's rating and review count follow in the same transaction.
 *
 * @throws NotFoundError when there's no such review.
 */
export async function deleteReview(id: string): Promise<{ productSlug: string }> {
  const { rows } = await query<{ product_slug: string }>(
    `DELETE FROM reviews r USING products p WHERE r.id = $1 AND p.id = r.product_id
     RETURNING p.slug AS product_slug`,
    [id],
  )
  if (!rows[0]) throw new NotFoundError("This review no longer exists.")
  log.info("Review deleted by an admin", { reviewId: id })
  return { productSlug: rows[0].product_slug }
}
