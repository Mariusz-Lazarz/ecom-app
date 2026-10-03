import "server-only"

import type { PoolClient } from "pg"

import { query, withTransaction } from "@/lib/db"
import { DiscountCodeError, loadDiscountCode } from "@/lib/discounts"
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import {
  NON_REVENUE_STATUSES,
  ORDER_STATUSES,
  RESTOCKING_STATUSES,
  canCustomerCancel,
  canTransition,
  checkDiscountCode,
  findPaymentMethod,
  quoteCheckout,
  type DiscountRule,
  type OrderStatus,
} from "@/lib/order-rules"
import { escapeLike } from "@/lib/products"
import { mediaUrl } from "@/lib/storage"
import type { CheckoutInput } from "@/lib/validation/checkout"
import { DEFAULT_ORDERS_PAGE_SIZE, MAX_ORDERS_PAGE_SIZE } from "@/lib/validation/orders"

/**
 * Orders: placing one from the signed-in user's cart, reading them (customer and admin views) and
 * moving them through the statuses in `ORDER_TRANSITIONS` (`@/lib/order-rules`).
 *
 * Orders snapshot everything at purchase time, including the discount code and what it took off.
 * Every status change, including the initial `pending`, is recorded in `order_status_events`.
 * Moving to `cancelled` or `rejected` puts the items back in stock and deletes the order's
 * discount redemption, so the code's limits count it no more.
 *
 * Locking: `placeOrder` locks the user's cart row, then the products (by id), then the cart's
 * discount code; status changes lock the order row, then its products (by id). Products are always
 * locked in id order, so the two can't deadlock each other.
 *
 * None of these read the session: callers (Server Actions, pages) pass the user id and check roles.
 */

const log = logger.child({ scope: "orders" })

export type ActorRole = "customer" | "admin" | "system"
export type OrderActor = { userId: string | null; role: ActorRole }

export type OrderAddress = {
  fullName: string
  line1: string
  line2: string | null
  city: string
  postalCode: string
  country: string
  phone: string
}

export type OrderItem = {
  id: string
  // null once the product has been deleted; the snapshot fields stay.
  productId: string | null
  name: string
  slug: string
  brand: string
  // The primary image at purchase time; render with next/image `fill` (no dimensions are stored).
  image: { url: string; alt: string } | null
  unitPriceCents: number
  compareAtCents: number | null
  quantity: number
  lineTotalCents: number
}

export type OrderEvent = {
  id: string
  status: OrderStatus
  actorRole: ActorRole
  // Only in the admin view (`getOrder`); null for customers and for deleted accounts.
  actorUserId: string | null
  note: string | null
  createdAt: Date
}

export type OrderCustomer = { id: string; name: string; email: string }

export type OrderSummary = {
  id: string
  number: string
  status: OrderStatus
  // Sum of quantities.
  itemCount: number
  totalCents: number
  // The discount code used, if any, and what it took off the subtotal.
  discountCode: string | null
  discountCents: number
  currency: string
  createdAt: Date
  updatedAt: Date
}

export type AdminOrderSummary = OrderSummary & { customer: OrderCustomer }

export type OrderDetail = OrderSummary & {
  customer: OrderCustomer
  address: OrderAddress
  shippingMethod: { id: string; name: string; priceCents: number }
  paymentMethod: { id: string; name: string }
  subtotalCents: number
  savingsCents: number
  shippingCents: number
  trackingNumber: string | null
  // In order of the cart at checkout.
  items: OrderItem[]
  // Oldest first.
  events: OrderEvent[]
}

export type Page<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
  // 0 when nothing matches. A `page` above it returns no items.
  pageCount: number
}

export type OrderListOptions = {
  status?: OrderStatus
  // Part of an order number (e.g. "10001") or of the customer's email; case-insensitive.
  q?: string
  page?: number
  pageSize?: number
}

export type OrderStats = {
  counts: Record<OrderStatus, number>
  totalOrders: number
  // Sum of totals over every order that isn't cancelled or rejected.
  revenueCents: number
  currency: string
}

/** A status change, as `OrderStatusChangeSchema` (`@/lib/validation/orders`) parses it. */
export type OrderStatusChange = {
  status: OrderStatus
  note?: string | null
  // Stored only when moving to `shipped`.
  trackingNumber?: string | null
}

/** A status change's outcome, for the UI to update in place. */
export type OrderStatusResult = {
  number: string
  status: OrderStatus
  previousStatus: OrderStatus
  trackingNumber: string | null
}

/** One cart line that can't be bought as is. */
export type StockProblem = {
  productId: string
  name: string
  requested: number
  // 0 when out of stock.
  available: number
}

/** The cart asks for more than is in stock. Nothing was written. */
export class InsufficientStockError extends ConflictError {
  constructor(readonly problems: StockProblem[]) {
    const list = problems
      .map((p) => (p.available === 0 ? `${p.name} (out of stock)` : `${p.name} (only ${p.available} left)`))
      .join(", ")
    super(`Some items in your cart aren't available in the quantity you asked for: ${list}. Update your cart and try again.`)
  }
}

export class EmptyCartError extends ConflictError {
  constructor() {
    super("Your cart is empty.")
  }
}

/** The order's current status doesn't allow the requested change. Nothing was written. */
export class InvalidTransitionError extends ConflictError {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    message = `This order is ${from} and can't be changed to ${to}.`,
  ) {
    super(message)
  }
}

const normalizeNumber = (number: string) => number.trim().toUpperCase()

const clampPageSize = (size: number | undefined) =>
  Math.min(Math.max(Math.trunc(size ?? DEFAULT_ORDERS_PAGE_SIZE), 1), MAX_ORDERS_PAGE_SIZE)
const clampPage = (page: number | undefined) => Math.max(Math.trunc(page ?? 1), 1)

// ── Placing an order ─────────────────────────────────────────────────────────────────────────────

type LockedLine = {
  product_id: string
  quantity: number
  position: number
}

type LockedProduct = {
  id: string
  slug: string
  name: string
  brand: string
  price_cents: number
  compare_at_cents: number | null
  currency: string
  stock: number
}

/**
 * Turns the user's cart into a paid `pending` order, in one transaction: locks the cart and its
 * products, checks stock, charges live prices, decrements stock, writes the order, its items and
 * the initial event, and empties the cart. A second submit of the same cart waits for the first
 * and then finds the cart empty.
 *
 * When the cart holds a discount code, the code row is locked and checked again against the live
 * subtotal and redemption counts (so two checkouts racing for a code's last use can't both get
 * it), the order is charged with it, a redemption is written and the code leaves the cart.
 *
 * @throws EmptyCartError when the cart is empty (or there is none).
 * @throws InsufficientStockError when a line is out of stock or asks for more than is left.
 * @throws DiscountCodeError when the cart's code can no longer be used. Nothing was written.
 * @throws BadRequestError for an unknown shipping or payment method.
 */
export async function placeOrder(userId: string, input: CheckoutInput): Promise<{ id: string; number: string }> {
  const paymentMethod = findPaymentMethod(input.paymentMethodId)
  // Fails fast on an unknown shipping method, before anything is locked.
  quoteCheckout({ items: [] }, input.shippingMethodId)
  if (!paymentMethod) throw new BadRequestError("Unknown payment method.")

  const order = await withTransaction(async (client) => {
    // The cart row lock serialises concurrent checkouts of the same cart (double submit).
    const { rows: carts } = await client.query<{ id: string; discount_code: string | null }>(
      "SELECT id, discount_code FROM carts WHERE user_id = $1 FOR UPDATE",
      [userId],
    )
    const cartId = carts[0]?.id
    if (!cartId) throw new EmptyCartError()

    const { rows: lines } = await client.query<LockedLine>(
      `SELECT product_id, quantity, (row_number() OVER (ORDER BY added_at, product_id) - 1)::int AS position
       FROM cart_items WHERE cart_id = $1
       ORDER BY added_at, product_id`,
      [cartId],
    )
    if (lines.length === 0) throw new EmptyCartError()

    // Locked in id order (the same order every caller uses), so concurrent checkouts can't deadlock.
    const { rows: productRows } = await client.query<LockedProduct>(
      `SELECT id, slug, name, brand, price_cents, compare_at_cents, currency, stock
       FROM products WHERE id = ANY($1::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [lines.map((line) => line.product_id)],
    )
    const products = new Map(productRows.map((p) => [p.id, p]))

    const problems: StockProblem[] = []
    for (const line of lines) {
      const product = products.get(line.product_id)
      // A deleted product's cart lines are deleted with it, so this only guards a race.
      if (!product) {
        problems.push({ productId: line.product_id, name: "A removed product", requested: line.quantity, available: 0 })
      } else if (line.quantity > product.stock) {
        problems.push({ productId: product.id, name: product.name, requested: line.quantity, available: product.stock })
      }
    }
    if (problems.length > 0) throw new InsufficientStockError(problems)

    const items = lines.map((line) => {
      const product = products.get(line.product_id)!
      return {
        product,
        position: line.position,
        quantity: line.quantity,
        priceCents: product.price_cents,
        compareAtCents: product.compare_at_cents,
      }
    })
    const discountCode = carts[0].discount_code
    let discount: { id: string; rule: DiscountRule } | null = null
    if (discountCode) {
      const code = await loadDiscountCode(discountCode, userId, { client, lock: true })
      const subtotalCents = quoteCheckout({ items }, input.shippingMethodId).subtotalCents
      const check = checkDiscountCode(code, subtotalCents)
      if (!check.ok) throw new DiscountCodeError(discountCode, check.problem, items[0].product.currency)
      discount = { id: code!.id, rule: check.rule }
    }
    const quote = quoteCheckout({ items }, input.shippingMethodId, discount?.rule ?? null)

    const { rows: images } = await client.query<{ product_id: string; storage_key: string }>(
      `SELECT DISTINCT ON (product_id) product_id, storage_key
       FROM product_images WHERE product_id = ANY($1::uuid[])
       ORDER BY product_id, position`,
      [lines.map((line) => line.product_id)],
    )
    const imageKeys = new Map(images.map((image) => [image.product_id, image.storage_key]))

    await client.query(
      `UPDATE products p SET stock = p.stock - v.quantity
       FROM unnest($1::uuid[], $2::int[]) AS v(id, quantity)
       WHERE p.id = v.id`,
      [items.map((item) => item.product.id), items.map((item) => item.quantity)],
    )

    const { rows: inserted } = await client.query<{ id: string; number: string }>(
      `INSERT INTO orders (user_id, full_name, line1, line2, city, postal_code, country, phone,
                           shipping_method_id, shipping_method_name, shipping_method_price_cents,
                           payment_method_id, payment_method_name,
                           subtotal_cents, savings_cents, discount_code, discount_cents, shipping_cents, total_cents,
                           currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING id, number`,
      [
        userId,
        input.fullName,
        input.line1,
        input.line2,
        input.city,
        input.postalCode,
        input.country,
        input.phone,
        quote.shippingMethod.id,
        quote.shippingMethod.name,
        quote.shippingMethodPriceCents,
        paymentMethod.id,
        paymentMethod.name,
        quote.subtotalCents,
        quote.savingsCents,
        discount?.rule.code ?? null,
        quote.discountCents,
        quote.shippingCents,
        quote.totalCents,
        items[0].product.currency,
      ],
    )
    const { id: orderId, number } = inserted[0]

    if (discount) {
      await client.query(
        "INSERT INTO discount_redemptions (code_id, order_id, user_id, amount_cents) VALUES ($1, $2, $3, $4)",
        [discount.id, orderId, userId, quote.discountCents + quote.shippingDiscountCents],
      )
    }

    await client.query(
      `INSERT INTO order_items (order_id, product_id, position, product_name, product_slug, brand, image_key,
                                unit_price_cents, compare_at_cents, quantity, line_total_cents)
       SELECT $1, v.product_id, v.position, v.name, v.slug, v.brand, v.image_key, v.price, v.compare_at, v.quantity,
              v.price * v.quantity
       FROM unnest($2::uuid[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::int[], $9::int[], $10::int[])
         AS v(product_id, position, name, slug, brand, image_key, price, compare_at, quantity)`,
      [
        orderId,
        items.map((item) => item.product.id),
        items.map((item) => item.position),
        items.map((item) => item.product.name),
        items.map((item) => item.product.slug),
        items.map((item) => item.product.brand),
        items.map((item) => imageKeys.get(item.product.id) ?? null),
        items.map((item) => item.priceCents),
        items.map((item) => item.compareAtCents),
        items.map((item) => item.quantity),
      ],
    )

    await recordEvent(client, orderId, "pending", { userId, role: "customer" }, null)

    await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId])
    await client.query("UPDATE carts SET discount_code = NULL, updated_at = now() WHERE id = $1", [cartId])

    return { id: orderId, number, totalCents: quote.totalCents, lines: items.length, discountCode: discount?.rule.code }
  })

  log.info("Order placed", {
    orderNumber: order.number,
    userId,
    totalCents: order.totalCents,
    lines: order.lines,
    discountCode: order.discountCode,
  })
  return { id: order.id, number: order.number }
}

async function recordEvent(
  client: PoolClient,
  orderId: string,
  status: OrderStatus,
  actor: OrderActor,
  note: string | null,
) {
  await client.query(
    `INSERT INTO order_status_events (order_id, status, actor_user_id, actor_role, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [orderId, status, actor.userId, actor.role, note],
  )
}

// ── Reading orders ───────────────────────────────────────────────────────────────────────────────

type SummaryRow = {
  id: string
  number: string
  status: OrderStatus
  item_count: number
  total_cents: number
  discount_code: string | null
  discount_cents: number
  currency: string
  created_at: Date
  updated_at: Date
}

type AdminSummaryRow = SummaryRow & {
  user_id: string
  first_name: string
  last_name: string
  email: string
  total_count: number
}

const SUMMARY_COLUMNS = `
  o.id, o.number, o.status, o.total_cents, o.discount_code, o.discount_cents, o.currency, o.created_at, o.updated_at,
  (SELECT COALESCE(SUM(quantity), 0)::int FROM order_items WHERE order_id = o.id) AS item_count`

function toSummary(row: SummaryRow): OrderSummary {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    itemCount: row.item_count,
    totalCents: row.total_cents,
    discountCode: row.discount_code,
    discountCents: row.discount_cents,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toAdminSummary(row: AdminSummaryRow): AdminOrderSummary {
  return {
    ...toSummary(row),
    customer: { id: row.user_id, name: `${row.first_name} ${row.last_name}`, email: row.email },
  }
}

function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, page, pageSize, total, pageCount: Math.ceil(total / pageSize) }
}

/** The user's orders, newest first. */
export async function listOrdersForUser(
  userId: string,
  { page, pageSize }: { page?: number; pageSize?: number } = {},
): Promise<Page<OrderSummary>> {
  const size = clampPageSize(pageSize)
  const current = clampPage(page)
  const [{ rows }, { rows: count }] = await Promise.all([
    query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM orders o
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC, o.number DESC
       LIMIT $2 OFFSET $3`,
      [userId, size, (current - 1) * size],
    ),
    query<{ total: number }>("SELECT count(*)::int AS total FROM orders WHERE user_id = $1", [userId]),
  ])
  return toPage(rows.map(toSummary), count[0].total, current, size)
}

type DetailRow = SummaryRow & {
  user_id: string
  first_name: string
  last_name: string
  email: string
  full_name: string
  line1: string
  line2: string | null
  city: string
  postal_code: string
  country: string
  phone: string
  shipping_method_id: string
  shipping_method_name: string
  shipping_method_price_cents: number
  payment_method_id: string
  payment_method_name: string
  subtotal_cents: number
  savings_cents: number
  shipping_cents: number
  tracking_number: string | null
}

type ItemRow = {
  id: string
  product_id: string | null
  product_name: string
  product_slug: string
  brand: string
  image_key: string | null
  unit_price_cents: number
  compare_at_cents: number | null
  quantity: number
  line_total_cents: number
}

type EventRow = {
  id: string
  status: OrderStatus
  actor_role: ActorRole
  actor_user_id: string | null
  note: string | null
  created_at: Date
}

async function findOrder(number: string, userId: string | null): Promise<OrderDetail | null> {
  const params: unknown[] = [normalizeNumber(number)]
  if (userId) params.push(userId)
  const { rows } = await query<DetailRow>(
    `SELECT ${SUMMARY_COLUMNS}, o.user_id, u.first_name, u.last_name, u.email,
            o.full_name, o.line1, o.line2, o.city, o.postal_code, o.country, o.phone,
            o.shipping_method_id, o.shipping_method_name, o.shipping_method_price_cents,
            o.payment_method_id, o.payment_method_name,
            o.subtotal_cents, o.savings_cents, o.shipping_cents, o.tracking_number
     FROM orders o JOIN users u ON u.id = o.user_id
     WHERE o.number = $1 ${userId ? "AND o.user_id = $2" : ""}`,
    params,
  )
  const row = rows[0]
  if (!row) return null

  const [{ rows: items }, { rows: events }] = await Promise.all([
    query<ItemRow>(
      `SELECT id, product_id, product_name, product_slug, brand, image_key, unit_price_cents, compare_at_cents,
              quantity, line_total_cents
       FROM order_items WHERE order_id = $1 ORDER BY position`,
      [row.id],
    ),
    query<EventRow>(
      `SELECT id, status, actor_role, actor_user_id, note, created_at
       FROM order_status_events WHERE order_id = $1 ORDER BY created_at, id`,
      [row.id],
    ),
  ])

  return {
    ...toSummary(row),
    customer: { id: row.user_id, name: `${row.first_name} ${row.last_name}`, email: row.email },
    address: {
      fullName: row.full_name,
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      postalCode: row.postal_code,
      country: row.country,
      phone: row.phone,
    },
    shippingMethod: {
      id: row.shipping_method_id,
      name: row.shipping_method_name,
      priceCents: row.shipping_method_price_cents,
    },
    paymentMethod: { id: row.payment_method_id, name: row.payment_method_name },
    subtotalCents: row.subtotal_cents,
    savingsCents: row.savings_cents,
    shippingCents: row.shipping_cents,
    trackingNumber: row.tracking_number,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.product_name,
      slug: item.product_slug,
      brand: item.brand,
      image: item.image_key ? { url: mediaUrl(item.image_key), alt: item.product_name } : null,
      unitPriceCents: item.unit_price_cents,
      compareAtCents: item.compare_at_cents,
      quantity: item.quantity,
      lineTotalCents: item.line_total_cents,
    })),
    events: events.map((event) => ({
      id: event.id,
      status: event.status,
      actorRole: event.actor_role,
      // Customers don't get to see which staff account made a change.
      actorUserId: userId ? null : event.actor_user_id,
      note: event.note,
      createdAt: event.created_at,
    })),
  }
}

/** The user's own order by number, or null when it doesn't exist or belongs to someone else. */
export async function getOrderForUser(userId: string, number: string): Promise<OrderDetail | null> {
  return findOrder(number, userId)
}

/** The shipping address of the user's most recent order, to prefill the checkout; null without orders. */
export async function getLatestShippingAddress(userId: string): Promise<OrderAddress | null> {
  const { rows } = await query<{
    full_name: string
    line1: string
    line2: string | null
    city: string
    postal_code: string
    country: string
    phone: string
  }>(
    `SELECT full_name, line1, line2, city, postal_code, country, phone FROM orders
     WHERE user_id = $1
     ORDER BY created_at DESC, number DESC
     LIMIT 1`,
    [userId],
  )
  const row = rows[0]
  if (!row) return null
  return {
    fullName: row.full_name,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    postalCode: row.postal_code,
    country: row.country,
    phone: row.phone,
  }
}

/** Any order by number (admin view, with the actors' user ids), or null. */
export async function getOrder(number: string): Promise<OrderDetail | null> {
  return findOrder(number, null)
}

/** All orders, newest first, for the admin list. Filters combine with AND. */
export async function listOrders(options: OrderListOptions = {}): Promise<Page<AdminOrderSummary>> {
  const size = clampPageSize(options.pageSize)
  const current = clampPage(options.page)
  const where: string[] = []
  const params: unknown[] = []
  if (options.status) {
    params.push(options.status)
    where.push(`o.status = $${params.length}`)
  }
  const q = options.q?.trim()
  if (q) {
    params.push(`%${escapeLike(q)}%`)
    where.push(`(o.number ILIKE $${params.length} OR u.email ILIKE $${params.length})`)
  }
  params.push(size, (current - 1) * size)

  // count(*) OVER () gives the total before LIMIT; a page past the end falls back to a count query.
  const { rows } = await query<AdminSummaryRow>(
    `SELECT ${SUMMARY_COLUMNS}, u.id AS user_id, u.first_name, u.last_name, u.email,
            count(*) OVER ()::int AS total_count
     FROM orders o JOIN users u ON u.id = o.user_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY o.created_at DESC, o.number DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )

  let total = rows[0]?.total_count ?? 0
  if (rows.length === 0 && current > 1) {
    const { rows: count } = await query<{ total: number }>(
      `SELECT count(*)::int AS total FROM orders o JOIN users u ON u.id = o.user_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
      params.slice(0, -2),
    )
    total = count[0].total
  }

  return toPage(rows.map(toAdminSummary), total, current, size)
}

/** Statuses an order waits in for the shop to act: the admin dashboard's "Needs attention" list. */
export const AWAITING_ACTION_STATUSES: readonly OrderStatus[] = ["pending", "processing"]

/** The oldest orders still waiting for the shop (`AWAITING_ACTION_STATUSES`), oldest first. */
export async function listOrdersAwaitingAction(limit = 5): Promise<AdminOrderSummary[]> {
  const { rows } = await query<AdminSummaryRow>(
    `SELECT ${SUMMARY_COLUMNS}, u.id AS user_id, u.first_name, u.last_name, u.email, 0 AS total_count
     FROM orders o JOIN users u ON u.id = o.user_id
     WHERE o.status = ANY($1::text[])
     ORDER BY o.created_at, o.number
     LIMIT $2`,
    [AWAITING_ACTION_STATUSES, clampPageSize(limit)],
  )
  return rows.map(toAdminSummary)
}

/** Order counts per status and revenue (totals of every order not cancelled or rejected). */
export async function getOrderStats(): Promise<OrderStats> {
  const { rows } = await query<{ status: OrderStatus; count: number; total: string }>(
    `SELECT status, count(*)::int AS count, COALESCE(SUM(total_cents), 0)::bigint AS total
     FROM orders GROUP BY status`,
  )
  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<OrderStatus, number>
  let revenueCents = 0
  let totalOrders = 0
  for (const row of rows) {
    counts[row.status] = row.count
    totalOrders += row.count
    if (!NON_REVENUE_STATUSES.includes(row.status)) revenueCents += Number(row.total)
  }
  return { counts, totalOrders, revenueCents, currency: "USD" }
}

// ── Status changes ───────────────────────────────────────────────────────────────────────────────

type LockedOrder = { id: string; number: string; user_id: string; status: OrderStatus; tracking_number: string | null }

async function lockOrder(client: PoolClient, number: string): Promise<LockedOrder | null> {
  const { rows } = await client.query<LockedOrder>(
    "SELECT id, number, user_id, status, tracking_number FROM orders WHERE number = $1 FOR UPDATE",
    [normalizeNumber(number)],
  )
  return rows[0] ?? null
}

/** Puts an order's items back in stock (lines whose product was deleted are skipped). */
async function restock(client: PoolClient, orderId: string) {
  const { rows } = await client.query<{ product_id: string; quantity: number }>(
    `SELECT product_id, SUM(quantity)::int AS quantity FROM order_items
     WHERE order_id = $1 AND product_id IS NOT NULL
     GROUP BY product_id ORDER BY product_id`,
    [orderId],
  )
  if (rows.length === 0) return
  const ids = rows.map((row) => row.product_id)
  // Same lock order as placeOrder.
  await client.query("SELECT id FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [ids])
  await client.query(
    `UPDATE products p SET stock = p.stock + v.quantity
     FROM unnest($1::uuid[], $2::int[]) AS v(id, quantity)
     WHERE p.id = v.id`,
    [ids, rows.map((row) => row.quantity)],
  )
}

async function applyTransition(
  client: PoolClient,
  order: LockedOrder,
  change: OrderStatusChange,
  actor: OrderActor,
): Promise<OrderStatusResult> {
  if (!canTransition(order.status, change.status)) throw new InvalidTransitionError(order.status, change.status)

  const trackingNumber = change.status === "shipped" ? (change.trackingNumber ?? null) : order.tracking_number
  await client.query("UPDATE orders SET status = $2, tracking_number = $3, updated_at = now() WHERE id = $1", [
    order.id,
    change.status,
    trackingNumber,
  ])
  if (RESTOCKING_STATUSES.includes(change.status)) {
    await restock(client, order.id)
    // The order no longer counts towards its discount code's limits; it keeps its snapshot.
    await client.query("DELETE FROM discount_redemptions WHERE order_id = $1", [order.id])
  }
  await recordEvent(client, order.id, change.status, actor, change.note ?? null)

  return { number: order.number, status: change.status, previousStatus: order.status, trackingNumber }
}

/**
 * Moves an order to a new status (admin). The order row is locked first, so of two concurrent
 * changes the second sees the first's result and is checked against it. Cancelling or rejecting
 * restocks the items and frees the discount code use; `shipped` stores the tracking number when
 * one is given.
 *
 * @throws NotFoundError when there's no such order.
 * @throws InvalidTransitionError when `ORDER_TRANSITIONS` doesn't allow the change.
 */
export async function changeOrderStatus(
  number: string,
  change: OrderStatusChange,
  actor: OrderActor,
): Promise<OrderStatusResult> {
  const result = await withTransaction(async (client) => {
    const order = await lockOrder(client, number)
    if (!order) throw new NotFoundError("Order not found.")
    return applyTransition(client, order, change, actor)
  })
  log.info("Order status changed", { ...result, actorRole: actor.role, actorUserId: actor.userId })
  return result
}

/**
 * Cancels the user's own order while it's still `pending`, restocking its items and freeing its
 * discount code use.
 *
 * @throws NotFoundError when there's no such order or it belongs to someone else.
 * @throws InvalidTransitionError when the order is past `pending`.
 */
export async function cancelOrderAsCustomer(userId: string, number: string): Promise<OrderStatusResult> {
  const result = await withTransaction(async (client) => {
    const order = await lockOrder(client, number)
    if (!order || order.user_id !== userId) throw new NotFoundError("Order not found.")
    if (!canCustomerCancel(order.status)) {
      throw new InvalidTransitionError(
        order.status,
        "cancelled",
        `This order is already ${order.status}, so it can't be cancelled online. Contact us if you need help.`,
      )
    }
    return applyTransition(client, order, { status: "cancelled", note: "Cancelled by the customer." }, {
      userId,
      role: "customer",
    })
  })
  log.info("Order cancelled by customer", { number: result.number, userId })
  return result
}
