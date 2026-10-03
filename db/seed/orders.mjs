// The order rules the app uses, so seeded totals and histories follow the same logic. The seed runs
// under tsx with the react-server condition (see `db:seed` in package.json), so TypeScript imports work.
import { canTransition, findPaymentMethod, quoteCheckout } from "../../src/lib/order-rules.ts"
import { ADMIN } from "./admin.mjs"
import { CUSTOMER } from "./customer.mjs"

const HOUR = 60 * 60 * 1000

const ADDRESS = {
  fullName: "Test Customer",
  line1: "123 Market Street",
  line2: "Apt 4B",
  city: "San Francisco",
  postalCode: "94103",
  country: "US",
  phone: "+1 415 555 0134",
}

/**
 * Sample orders for the test customer. Numbers NC-1001…NC-1012 sit below the order number
 * sequence's minimum (10001), so real orders never collide with them, and they identify the
 * seeded orders: every run deletes and re-creates exactly these.
 *
 * `history` lists the changes after the initial `pending`: [status, hours after placing, actor,
 * note?]. Every step must be allowed by ORDER_TRANSITIONS.
 */
const ORDERS = [
  {
    number: "NC-1001",
    hoursAgo: 58 * 24,
    shipping: "standard",
    payment: "cards",
    items: [["halden-aria-anc-wireless-headphones", 1]],
    history: [
      ["processing", 20, "admin"],
      ["shipped", 44, "admin"],
      ["delivered", 5 * 24, "admin"],
    ],
  },
  {
    number: "NC-1002",
    hoursAgo: 52 * 24,
    shipping: "express",
    payment: "wallets",
    items: [
      ["strider-velocity-knit-running-shoe", 1],
      ["fieldnote-washed-cotton-cap", 2],
    ],
    history: [
      ["processing", 3, "admin"],
      ["shipped", 10, "admin"],
      ["delivered", 40, "admin"],
    ],
  },
  {
    number: "NC-1003",
    hoursAgo: 47 * 24,
    shipping: "standard",
    payment: "pay-later",
    items: [["kinetic-retro-suede-runner", 1]],
    history: [["cancelled", 3, "customer", "Cancelled by the customer."]],
  },
  {
    number: "NC-1004",
    hoursAgo: 41 * 24,
    shipping: "pickup",
    payment: "gift-cards",
    items: [
      ["harbor-leather-card-holder", 1],
      ["harbor-leather-full-grain-belt", 1],
    ],
    history: [
      ["processing", 18, "admin"],
      ["shipped", 30, "admin"],
      ["delivered", 4 * 24, "admin"],
    ],
  },
  {
    number: "NC-1005",
    hoursAgo: 35 * 24,
    shipping: "next-day",
    payment: "cards",
    items: [["calder-meridian-blue-dial-automatic", 1]],
    history: [
      ["processing", 2, "admin"],
      ["rejected", 6, "admin", "Payment flagged by the fraud check."],
    ],
  },
  {
    number: "NC-1006",
    hoursAgo: 28 * 24,
    shipping: "next-day",
    payment: "wallets",
    items: [
      ["polaris-onestep-instant-camera", 1],
      ["marlowe-pebble-mini-speaker", 1],
    ],
    history: [
      ["processing", 1, "admin"],
      ["shipped", 5, "admin"],
      ["delivered", 26, "admin"],
    ],
  },
  {
    number: "NC-1007",
    hoursAgo: 21 * 24,
    shipping: "standard",
    payment: "cards",
    items: [["tern-commuter-backpack-22l", 1]],
    history: [
      ["processing", 16, "admin"],
      ["cancelled", 22, "admin", "The customer asked us to cancel by email."],
    ],
  },
  {
    // Under the free-shipping threshold, so standard shipping is charged.
    number: "NC-1008",
    hoursAgo: 14 * 24,
    shipping: "standard",
    payment: "cards",
    items: [["fieldnote-washed-cotton-cap", 1]],
    history: [
      ["processing", 20, "admin"],
      ["shipped", 46, "admin"],
    ],
  },
  {
    number: "NC-1009",
    hoursAgo: 9 * 24,
    shipping: "express",
    payment: "pay-later",
    items: [
      ["solenne-riviera-round-metal-sunglasses", 1],
      ["harbor-leather-midnight-slim-wallet", 1],
    ],
    history: [
      ["processing", 4, "admin"],
      ["shipped", 12, "admin"],
    ],
  },
  {
    number: "NC-1010",
    hoursAgo: 5 * 24,
    shipping: "standard",
    payment: "wallets",
    items: [["sonvik-pulse-pro-true-wireless-earbuds", 1]],
    history: [["processing", 22, "admin"]],
  },
  {
    number: "NC-1011",
    hoursAgo: 2 * 24,
    shipping: "standard",
    payment: "cards",
    items: [["fieldnote-organic-canvas-tote", 2]],
    history: [["rejected", 5, "admin", "We couldn't verify the shipping address."]],
  },
  {
    number: "NC-1012",
    hoursAgo: 6,
    shipping: "standard",
    payment: "cards",
    items: [
      ["harbor-leather-heritage-bifold-wallet", 1],
      ["fieldnote-organic-canvas-tote", 1],
    ],
    history: [],
  },
]

export const SEEDED_ORDER_NUMBERS = ORDERS.map((order) => order.number)

const trackingNumber = (number) => `1ZNC${number.slice(3).padStart(6, "0")}US`

async function loadProducts(client) {
  const slugs = [...new Set(ORDERS.flatMap((order) => order.items.map(([slug]) => slug)))]
  const { rows } = await client.query(
    `SELECT p.id, p.slug, p.name, p.brand, p.price_cents, p.compare_at_cents, p.currency,
            (SELECT storage_key FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1) AS image_key
     FROM products p WHERE p.slug = ANY($1::text[])`,
    [slugs],
  )
  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  const missing = slugs.filter((slug) => !bySlug.has(slug))
  if (missing.length) throw new Error(`orders need the seeded products (missing: ${missing.join(", ")})`)
  return bySlug
}

async function userId(client, email) {
  const { rows } = await client.query("SELECT id FROM users WHERE lower(email) = $1", [email.toLowerCase()])
  return rows[0]?.id ?? null
}

async function insertOrder(client, spec, { customerId, adminId, products, now }) {
  const createdAt = new Date(now - spec.hoursAgo * HOUR)
  const lines = spec.items.map(([slug, quantity]) => {
    const product = products.get(slug)
    return { product, quantity, priceCents: product.price_cents, compareAtCents: product.compare_at_cents }
  })
  const quote = quoteCheckout({ items: lines }, spec.shipping)
  const payment = findPaymentMethod(spec.payment)
  if (!payment) throw new Error(`order ${spec.number}: unknown payment method "${spec.payment}"`)

  const events = [{ status: "pending", at: createdAt, actor: "customer", note: null }]
  for (const [status, hoursAfter, actor, note] of spec.history) {
    const previous = events.at(-1).status
    if (!canTransition(previous, status)) throw new Error(`order ${spec.number}: ${previous} → ${status} isn't allowed`)
    events.push({ status, at: new Date(createdAt.getTime() + hoursAfter * HOUR), actor, note: note ?? null })
  }
  const last = events.at(-1)
  const shipped = events.some((event) => event.status === "shipped")

  const { rows } = await client.query(
    `INSERT INTO orders (number, user_id, status, full_name, line1, line2, city, postal_code, country, phone,
                         shipping_method_id, shipping_method_name, shipping_method_price_cents,
                         payment_method_id, payment_method_name,
                         subtotal_cents, savings_cents, shipping_cents, total_cents, currency,
                         tracking_number, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
     RETURNING id`,
    [
      spec.number,
      customerId,
      last.status,
      ADDRESS.fullName,
      ADDRESS.line1,
      ADDRESS.line2,
      ADDRESS.city,
      ADDRESS.postalCode,
      ADDRESS.country,
      ADDRESS.phone,
      quote.shippingMethod.id,
      quote.shippingMethod.name,
      quote.shippingMethodPriceCents,
      payment.id,
      payment.name,
      quote.subtotalCents,
      quote.savingsCents,
      quote.shippingCents,
      quote.totalCents,
      lines[0].product.currency,
      shipped ? trackingNumber(spec.number) : null,
      createdAt,
      last.at,
    ],
  )
  const orderId = rows[0].id

  for (const [position, line] of lines.entries()) {
    const { product } = line
    await client.query(
      `INSERT INTO order_items (order_id, product_id, position, product_name, product_slug, brand, image_key,
                                unit_price_cents, compare_at_cents, quantity, line_total_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        orderId,
        product.id,
        position,
        product.name,
        product.slug,
        product.brand,
        product.image_key,
        line.priceCents,
        line.compareAtCents,
        line.quantity,
        line.priceCents * line.quantity,
      ],
    )
  }

  for (const event of events) {
    await client.query(
      `INSERT INTO order_status_events (order_id, status, actor_user_id, actor_role, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, event.status, event.actor === "customer" ? customerId : adminId, event.actor, event.note, event.at],
    )
  }
}

/**
 * Replaces the test customer's sample orders (NC-1001…NC-1012): deletes them (items and events go
 * with them) and inserts them again, dated relative to now, with the current product prices.
 * They are history only: seeding never changes product stock, and the products step resets stock
 * anyway. Needs the customer, admin and products steps to have run.
 */
export async function seedOrders(client) {
  const customerId = await userId(client, CUSTOMER.email)
  if (!customerId) throw new Error(`orders need the test customer ${CUSTOMER.email} (run the customer step first)`)
  const adminId = await userId(client, ADMIN.email)
  const products = await loadProducts(client)
  const now = Date.now()

  await client.query("BEGIN")
  try {
    await client.query("DELETE FROM orders WHERE number = ANY($1::text[])", [SEEDED_ORDER_NUMBERS])
    for (const spec of ORDERS) {
      await insertOrder(client, spec, { customerId, adminId, products, now })
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  }
  return `${ORDERS.length} orders for ${CUSTOMER.email} (${SEEDED_ORDER_NUMBERS[0]}…${SEEDED_ORDER_NUMBERS.at(-1)})`
}
