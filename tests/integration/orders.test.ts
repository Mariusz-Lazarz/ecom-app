import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Runs the orders module against the docker compose Postgres. Every test works on its own
// throwaway category, products and users; their orders (with items and events), carts, products
// and the category are removed afterwards. Carts are filled with SQL, since the cart module reads
// the session.
vi.mock("server-only", () => ({}))
// `@/lib/products` (for escapeLike) imports `connection` from next/server.
vi.mock("next/server", () => ({ connection: async () => {} }))

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const orders = await import("@/lib/orders")
const { ORDER_TRANSITIONS, ORDER_STATUSES } = await import("@/lib/order-rules")
const { NotFoundError, BadRequestError } = await import("@/lib/errors")
const { CheckoutSchema } = await import("@/lib/validation/checkout")
type OrderStatus = (typeof ORDER_STATUSES)[number]

const run = Array.from({ length: 10 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")
let categoryId: string
const userIds: string[] = []
let productCount = 0

const checkout = (overrides: Record<string, string> = {}) =>
  CheckoutSchema.parse({
    fullName: "Ada Lovelace",
    line1: "12 Analytical Row",
    line2: "",
    city: "London",
    postalCode: "ec1a 1bb",
    country: "gb",
    phone: "+44 20 7946 0958",
    shippingMethodId: "standard",
    paymentMethodId: "cards",
    ...overrides,
  })

async function makeProduct({
  price = 1000,
  compareAt = null,
  stock = 10,
  withImage = false,
}: { price?: number; compareAt?: number | null; stock?: number; withImage?: boolean } = {}) {
  productCount += 1
  const slug = `orders-${run}-${productCount}`
  const name = `Order product ${productCount} ${run}`
  const { rows } = await query<{ id: string }>(
    `INSERT INTO products (slug, name, brand, category_id, short_description, description, price_cents,
                           compare_at_cents, stock)
     VALUES ($1, $2, 'Testco', $3, 'Short', 'Long description.', $4, $5, $6)
     RETURNING id`,
    [slug, name, categoryId, price, compareAt, stock],
  )
  const id = rows[0].id
  if (withImage) {
    await query(
      `INSERT INTO product_images (product_id, storage_key, width, height, alt, position)
       VALUES ($1, $2, 800, 600, 'second', 1), ($1, $3, 800, 600, 'primary', 0)`,
      [id, `test/${run}/${slug}-2.webp`, `test/${run}/${slug}.webp`],
    )
  }
  return { id, slug, name }
}

async function makeUser(role: "user" | "admin" = "user") {
  const { rows } = await query<{ id: string; email: string }>(
    `INSERT INTO users (first_name, last_name, email, password_hash, role)
     VALUES ('Order', 'Tester', $1, 'not-a-real-hash', $2) RETURNING id, email`,
    [`orders-${run}-${userIds.length}@example.com`, role],
  )
  userIds.push(rows[0].id)
  return rows[0]
}

/** Replaces the user's cart with these lines (in this order). */
async function fillCart(userId: string, lines: [productId: string, quantity: number][]) {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO carts (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id`,
    [userId],
  )
  await query("DELETE FROM cart_items WHERE cart_id = $1", [rows[0].id])
  for (const [productId, quantity] of lines) {
    await query("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)", [
      rows[0].id,
      productId,
      quantity,
    ])
  }
}

async function cartLines(userId: string) {
  const { rows } = await query<{ product_id: string; quantity: number }>(
    `SELECT ci.product_id, ci.quantity FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
     WHERE c.user_id = $1 ORDER BY ci.added_at`,
    [userId],
  )
  return rows
}

async function stock(productId: string) {
  const { rows } = await query<{ stock: number }>("SELECT stock FROM products WHERE id = $1", [productId])
  return rows[0].stock
}

async function orderCount(userId: string) {
  const { rows } = await query<{ n: number }>("SELECT count(*)::int AS n FROM orders WHERE user_id = $1", [userId])
  return rows[0].n
}

/** A fresh user with a placed (pending) order for one unit of a fresh product. */
async function pendingOrder({ quantity = 1, productStock = 10 } = {}) {
  const user = await makeUser()
  const product = await makeProduct({ stock: productStock })
  await fillCart(user.id, [[product.id, quantity]])
  const { number } = await orders.placeOrder(user.id, checkout())
  return { user, product, number }
}

/** Walks an order along the given statuses as an admin. */
async function advance(number: string, statuses: OrderStatus[], admin: { id: string }) {
  for (const status of statuses) {
    await orders.changeOrderStatus(number, { status }, { userId: admin.id, role: "admin" })
  }
}

let admin: { id: string; email: string }

beforeAll(async () => {
  const { rows } = await query<{ id: string }>(
    "INSERT INTO categories (slug, name, icon, position) VALUES ($1, $2, 'box', 999) RETURNING id",
    [`orders-${run}`, `Orders test ${run}`],
  )
  categoryId = rows[0].id
  admin = await makeUser("admin")
})

afterAll(async () => {
  // Items and events go with their orders; carts with their users.
  await query("DELETE FROM orders WHERE user_id = ANY($1::uuid[])", [userIds])
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds])
  await query("DELETE FROM products WHERE category_id = $1", [categoryId])
  await query("DELETE FROM categories WHERE id = $1", [categoryId])
  await getPool().end()
})

describe("placeOrder", () => {
  it("turns the cart into a pending order with snapshots, decrements stock and empties the cart", async () => {
    const user = await makeUser()
    const onSale = await makeProduct({ price: 2500, compareAt: 4000, stock: 5, withImage: true })
    const regular = await makeProduct({ price: 1299, stock: 3 })
    await fillCart(user.id, [
      [onSale.id, 2],
      [regular.id, 3],
    ])

    const { number } = await orders.placeOrder(user.id, checkout())

    expect(number).toMatch(/^NC-\d{5,}$/)
    expect(Number(number.slice(3))).toBeGreaterThanOrEqual(10001)
    expect(await stock(onSale.id)).toBe(3)
    expect(await stock(regular.id)).toBe(0)
    expect(await cartLines(user.id)).toEqual([])

    const order = await orders.getOrderForUser(user.id, number)
    expect(order).toMatchObject({
      number,
      status: "pending",
      itemCount: 5,
      // 2 × 25.00 + 3 × 12.99 = 88.97, over the threshold: free standard shipping.
      subtotalCents: 8897,
      savingsCents: 3000,
      shippingCents: 0,
      totalCents: 8897,
      currency: "USD",
      trackingNumber: null,
      customer: { id: user.id, name: "Order Tester", email: user.email },
      address: {
        fullName: "Ada Lovelace",
        line1: "12 Analytical Row",
        line2: null,
        city: "London",
        postalCode: "EC1A 1BB",
        country: "GB",
        phone: "+44 20 7946 0958",
      },
      shippingMethod: { id: "standard", name: "Standard", priceCents: 599 },
      paymentMethod: { id: "cards", name: "Credit & debit cards" },
    })
    expect(order!.items).toEqual([
      {
        id: expect.any(String),
        productId: onSale.id,
        name: onSale.name,
        slug: onSale.slug,
        brand: "Testco",
        image: { url: expect.stringMatching(new RegExp(`/test/${run}/${onSale.slug}\\.webp$`)), alt: onSale.name },
        unitPriceCents: 2500,
        compareAtCents: 4000,
        quantity: 2,
        lineTotalCents: 5000,
      },
      {
        id: expect.any(String),
        productId: regular.id,
        name: regular.name,
        slug: regular.slug,
        brand: "Testco",
        image: null,
        unitPriceCents: 1299,
        compareAtCents: null,
        quantity: 3,
        lineTotalCents: 3897,
      },
    ])
    expect(order!.events).toEqual([
      { id: expect.any(String), status: "pending", actorRole: "customer", actorUserId: null, note: null, createdAt: expect.any(Date) },
    ])
    // The admin view shows who set the status.
    expect((await orders.getOrder(number))!.events[0].actorUserId).toBe(user.id)
  })

  it("keeps the snapshot when the product changes or is deleted later", async () => {
    const { user, product, number } = await pendingOrder()
    await query("UPDATE products SET name = 'Renamed', price_cents = 99999 WHERE id = $1", [product.id])
    let order = await orders.getOrderForUser(user.id, number)
    expect(order!.items[0]).toMatchObject({ name: product.name, unitPriceCents: 1000, productId: product.id })

    await query("DELETE FROM products WHERE id = $1", [product.id])
    order = await orders.getOrderForUser(user.id, number)
    expect(order!.items[0]).toMatchObject({ name: product.name, unitPriceCents: 1000, productId: null })
  })

  it("charges live prices, not what the cart showed earlier", async () => {
    const user = await makeUser()
    const product = await makeProduct({ price: 1000 })
    await fillCart(user.id, [[product.id, 1]])
    await query("UPDATE products SET price_cents = 1500 WHERE id = $1", [product.id])

    const { number } = await orders.placeOrder(user.id, checkout())
    expect(await orders.getOrderForUser(user.id, number)).toMatchObject({ subtotalCents: 1500, totalCents: 2099 })
  })

  it.each([
    // [unit price, shipping method, expected shipping]
    [4999, "standard", 599],
    [5000, "standard", 0],
    [5000, "express", 1299],
    [5000, "pickup", 0],
    [1000, "next-day", 1999],
  ])("subtotal %i with %s ships for %i", async (price, shippingMethodId, shippingCents) => {
    const user = await makeUser()
    const product = await makeProduct({ price })
    await fillCart(user.id, [[product.id, 1]])

    const { number } = await orders.placeOrder(user.id, checkout({ shippingMethodId }))

    expect(await orders.getOrderForUser(user.id, number)).toMatchObject({
      subtotalCents: price,
      shippingCents,
      totalCents: price + shippingCents,
      shippingMethod: { id: shippingMethodId },
    })
  })

  it("rejects an empty cart, and a user without a cart", async () => {
    const user = await makeUser()
    await expect(orders.placeOrder(user.id, checkout())).rejects.toBeInstanceOf(orders.EmptyCartError)
    await fillCart(user.id, [])
    await expect(orders.placeOrder(user.id, checkout())).rejects.toMatchObject({
      status: 409,
      message: "Your cart is empty.",
    })
    expect(await orderCount(user.id)).toBe(0)
  })

  it("rejects out-of-stock and over-stock lines, naming them, and writes nothing", async () => {
    const user = await makeUser()
    const fine = await makeProduct({ stock: 5 })
    const soldOut = await makeProduct({ stock: 5 })
    const scarce = await makeProduct({ stock: 5 })
    await fillCart(user.id, [
      [fine.id, 1],
      [soldOut.id, 1],
      [scarce.id, 4],
    ])
    await query("UPDATE products SET stock = 0 WHERE id = $1", [soldOut.id])
    await query("UPDATE products SET stock = 2 WHERE id = $1", [scarce.id])

    const err = await orders.placeOrder(user.id, checkout()).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(orders.InsufficientStockError)
    expect(err).toMatchObject({
      status: 409,
      code: "conflict",
      problems: [
        { productId: soldOut.id, name: soldOut.name, requested: 1, available: 0 },
        { productId: scarce.id, name: scarce.name, requested: 4, available: 2 },
      ],
    })
    expect((err as Error).message).toContain(`${soldOut.name} (out of stock)`)
    expect((err as Error).message).toContain(`${scarce.name} (only 2 left)`)
    expect((err as Error).message).not.toContain(fine.name)
    expect(await orderCount(user.id)).toBe(0)
    expect(await stock(fine.id)).toBe(5)
    expect(await cartLines(user.id)).toHaveLength(3)
  })

  it("rejects unknown shipping or payment methods before touching anything", async () => {
    const user = await makeUser()
    const product = await makeProduct()
    await fillCart(user.id, [[product.id, 1]])
    const input = checkout()

    await expect(orders.placeOrder(user.id, { ...input, shippingMethodId: "teleport" })).rejects.toBeInstanceOf(
      BadRequestError,
    )
    await expect(orders.placeOrder(user.id, { ...input, paymentMethodId: "iou" })).rejects.toBeInstanceOf(
      BadRequestError,
    )
    expect(await orderCount(user.id)).toBe(0)
    expect(await cartLines(user.id)).toHaveLength(1)
  })

  it("sells the last unit to exactly one of two concurrent buyers", async () => {
    const product = await makeProduct({ stock: 1 })
    const buyers = [await makeUser(), await makeUser()]
    for (const buyer of buyers) await fillCart(buyer.id, [[product.id, 1]])

    const results = await Promise.allSettled(buyers.map((buyer) => orders.placeOrder(buyer.id, checkout())))

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    const rejected = results.filter((r) => r.status === "rejected")
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toBeInstanceOf(orders.InsufficientStockError)
    expect(await stock(product.id)).toBe(0)
    expect((await orderCount(buyers[0].id)) + (await orderCount(buyers[1].id))).toBe(1)
  })

  it("creates one order from a double submit; the second finds the cart empty", async () => {
    const user = await makeUser()
    const product = await makeProduct({ stock: 10 })
    await fillCart(user.id, [[product.id, 2]])

    const results = await Promise.allSettled([
      orders.placeOrder(user.id, checkout()),
      orders.placeOrder(user.id, checkout()),
    ])

    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"])
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(orders.EmptyCartError)
    expect(await orderCount(user.id)).toBe(1)
    expect(await stock(product.id)).toBe(8)
  })
})

describe("reading orders", () => {
  it("never shows a user someone else's order", async () => {
    const { user, number } = await pendingOrder()
    const stranger = await makeUser()

    expect(await orders.getOrderForUser(stranger.id, number)).toBeNull()
    expect((await orders.listOrdersForUser(stranger.id)).items).toEqual([])
    expect((await orders.getOrderForUser(user.id, number.toLowerCase()))?.number).toBe(number)
    expect(await orders.getOrderForUser(user.id, "NC-0")).toBeNull()
    expect(await orders.getOrder("NC-0")).toBeNull()
  })

  it("lists a user's orders newest first, paginated", async () => {
    const user = await makeUser()
    const product = await makeProduct({ stock: 10 })
    const numbers: string[] = []
    for (let i = 0; i < 3; i++) {
      await fillCart(user.id, [[product.id, 1]])
      numbers.push((await orders.placeOrder(user.id, checkout())).number)
    }

    const first = await orders.listOrdersForUser(user.id, { page: 1, pageSize: 2 })
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3, pageCount: 2 })
    expect(first.items.map((o) => o.number)).toEqual([numbers[2], numbers[1]])
    expect(first.items[0]).toMatchObject({ status: "pending", itemCount: 1, totalCents: 1599, currency: "USD" })

    const second = await orders.listOrdersForUser(user.id, { page: 2, pageSize: 2 })
    expect(second.items.map((o) => o.number)).toEqual([numbers[0]])
    expect((await orders.listOrdersForUser(user.id, { page: 3, pageSize: 2 })).items).toEqual([])
  })
})

describe("cancelOrderAsCustomer", () => {
  it("cancels a pending order, restocks it and records the customer", async () => {
    const { user, product, number } = await pendingOrder({ quantity: 3, productStock: 5 })
    expect(await stock(product.id)).toBe(2)

    const result = await orders.cancelOrderAsCustomer(user.id, number)

    expect(result).toEqual({ number, status: "cancelled", previousStatus: "pending", trackingNumber: null })
    expect(await stock(product.id)).toBe(5)
    const events = (await orders.getOrder(number))!.events
    expect(events.map((e) => [e.status, e.actorRole, e.actorUserId])).toEqual([
      ["pending", "customer", user.id],
      ["cancelled", "customer", user.id],
    ])
  })

  it("refuses once the order is processing, and changes nothing", async () => {
    const { user, product, number } = await pendingOrder()
    await advance(number, ["processing"], admin)

    await expect(orders.cancelOrderAsCustomer(user.id, number)).rejects.toBeInstanceOf(orders.InvalidTransitionError)
    expect((await orders.getOrder(number))!.status).toBe("processing")
    expect(await stock(product.id)).toBe(9)
  })

  it("refuses a second cancel", async () => {
    const { user, product, number } = await pendingOrder()
    await orders.cancelOrderAsCustomer(user.id, number)
    await expect(orders.cancelOrderAsCustomer(user.id, number)).rejects.toMatchObject({ status: 409 })
    expect(await stock(product.id)).toBe(10)
  })

  it("treats someone else's order as not found", async () => {
    const { number } = await pendingOrder()
    const stranger = await makeUser()
    await expect(orders.cancelOrderAsCustomer(stranger.id, number)).rejects.toBeInstanceOf(NotFoundError)
    expect((await orders.getOrder(number))!.status).toBe("pending")
  })
})

describe("changeOrderStatus", () => {
  const paths: Record<OrderStatus, OrderStatus[]> = {
    pending: [],
    processing: ["processing"],
    shipped: ["processing", "shipped"],
    delivered: ["processing", "shipped", "delivered"],
    cancelled: ["cancelled"],
    rejected: ["rejected"],
  }
  const allowed = ORDER_STATUSES.flatMap((from) => ORDER_TRANSITIONS[from].map((to) => [from, to] as const))
  const forbidden = ORDER_STATUSES.flatMap((from) =>
    ORDER_STATUSES.filter((to) => !ORDER_TRANSITIONS[from].includes(to)).map((to) => [from, to] as const),
  )

  it.each(allowed)("allows %s → %s", async (from, to) => {
    const { number } = await pendingOrder()
    await advance(number, paths[from], admin)

    const result = await orders.changeOrderStatus(number, { status: to, note: "Checked." }, { userId: admin.id, role: "admin" })

    expect(result).toMatchObject({ number, status: to, previousStatus: from })
    const order = (await orders.getOrder(number))!
    expect(order.status).toBe(to)
    expect(order.events.at(-1)).toMatchObject({ status: to, actorRole: "admin", actorUserId: admin.id, note: "Checked." })
    expect(order.events.map((e) => e.status)).toEqual(["pending", ...paths[from], to])
  })

  it.each(forbidden)("refuses %s → %s and writes nothing", async (from, to) => {
    const { number } = await pendingOrder()
    await advance(number, paths[from], admin)
    const before = (await orders.getOrder(number))!

    await expect(
      orders.changeOrderStatus(number, { status: to }, { userId: admin.id, role: "admin" }),
    ).rejects.toMatchObject({ status: 409, from, to })

    const after = (await orders.getOrder(number))!
    expect(after.status).toBe(from)
    expect(after.events).toHaveLength(before.events.length)
  })

  it("stores the tracking number when shipping, and keeps it on delivery", async () => {
    const { number } = await pendingOrder()
    await advance(number, ["processing"], admin)

    const shipped = await orders.changeOrderStatus(
      number,
      { status: "shipped", trackingNumber: "1Z999AA10123456784" },
      { userId: admin.id, role: "admin" },
    )
    expect(shipped.trackingNumber).toBe("1Z999AA10123456784")
    await advance(number, ["delivered"], admin)
    expect(await orders.getOrder(number)).toMatchObject({ status: "delivered", trackingNumber: "1Z999AA10123456784" })
  })

  it.each(["cancelled", "rejected"] as const)("restocks on %s from processing", async (status) => {
    const { product, number } = await pendingOrder({ quantity: 4, productStock: 4 })
    await advance(number, ["processing"], admin)
    expect(await stock(product.id)).toBe(0)

    await orders.changeOrderStatus(number, { status, note: "Out of policy." }, { userId: admin.id, role: "admin" })

    expect(await stock(product.id)).toBe(4)
  })

  it("doesn't restock for other changes", async () => {
    const { product, number } = await pendingOrder({ quantity: 2 })
    await advance(number, ["processing", "shipped", "delivered"], admin)
    expect(await stock(product.id)).toBe(8)
  })

  it("lets only one of two concurrent changes win", async () => {
    const { product, number } = await pendingOrder({ quantity: 2 })
    const actor = { userId: admin.id, role: "admin" as const }

    const results = await Promise.allSettled([
      orders.changeOrderStatus(number, { status: "cancelled" }, actor),
      orders.changeOrderStatus(number, { status: "rejected" }, actor),
    ])

    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"])
    const order = (await orders.getOrder(number))!
    expect(["cancelled", "rejected"]).toContain(order.status)
    expect(order.events).toHaveLength(2)
    // Restocked exactly once.
    expect(await stock(product.id)).toBe(10)
  })

  it("throws NotFoundError for an unknown order", async () => {
    await expect(
      orders.changeOrderStatus("NC-0", { status: "processing" }, { userId: admin.id, role: "admin" }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("admin list and stats", () => {
  it("filters by status, searches by number or email, and paginates", async () => {
    const customer = await makeUser()
    const other = await makeUser()
    const product = await makeProduct({ stock: 50 })
    const place = async (userId: string) => {
      await fillCart(userId, [[product.id, 1]])
      return (await orders.placeOrder(userId, checkout())).number
    }
    const a = await place(customer.id)
    const b = await place(customer.id)
    const c = await place(customer.id)
    const d = await place(other.id)
    await advance(b, ["processing"], admin)

    const byEmail = await orders.listOrders({ q: customer.email.toUpperCase(), pageSize: 2 })
    expect(byEmail).toMatchObject({ total: 3, page: 1, pageSize: 2, pageCount: 2 })
    expect(byEmail.items.map((o) => o.number)).toEqual([c, b])
    expect(byEmail.items[0].customer).toEqual({ id: customer.id, name: "Order Tester", email: customer.email })
    const page2 = await orders.listOrders({ q: customer.email, pageSize: 2, page: 2 })
    expect(page2.items.map((o) => o.number)).toEqual([a])
    const past = await orders.listOrders({ q: customer.email, pageSize: 2, page: 5 })
    expect(past).toMatchObject({ items: [], total: 3, pageCount: 2 })

    const processing = await orders.listOrders({ q: customer.email, status: "processing" })
    expect(processing.items.map((o) => o.number)).toEqual([b])
    expect((await orders.listOrders({ q: customer.email, status: "shipped" })).total).toBe(0)

    const byNumber = await orders.listOrders({ q: d.toLowerCase() })
    expect(byNumber.items.map((o) => o.number)).toEqual([d])
    // LIKE wildcards in the search are literal.
    expect((await orders.listOrders({ q: `orders-${run}-%` })).total).toBe(0)
  })

  it("counts orders per status and sums revenue without cancelled or rejected", async () => {
    const before = await orders.getOrderStats()
    const placed = []
    for (let i = 0; i < 4; i++) placed.push(await pendingOrder())
    await advance(placed[1].number, ["processing", "shipped"], admin)
    await advance(placed[2].number, ["cancelled"], admin)
    await advance(placed[3].number, ["rejected"], admin)

    const after = await orders.getOrderStats()

    // Every order is 10.00 + 5.99 standard shipping.
    expect(after.totalOrders - before.totalOrders).toBe(4)
    expect(after.revenueCents - before.revenueCents).toBe(2 * 1599)
    const delta = Object.fromEntries(ORDER_STATUSES.map((s) => [s, after.counts[s] - before.counts[s]]))
    expect(delta).toEqual({ pending: 1, processing: 0, shipped: 1, delivered: 0, cancelled: 1, rejected: 1 })
  })
})
