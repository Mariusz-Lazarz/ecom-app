import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Runs the analytics queries (and the orders CSV export query) against the docker compose
// Postgres. Orders are inserted with SQL at fixed timestamps in March 2001, long before any real or
// seeded order, so every figure for those days comes from this file alone. Its users (with their
// orders, items and events), products and category are removed afterwards.
vi.mock("server-only", () => ({}))
// `@/lib/products` (for escapeLike) imports `connection` from next/server.
vi.mock("next/server", () => ({ connection: async () => {} }))

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const { getAnalytics, getDailySales, getRevenueTrend, DELETED_PRODUCTS_LABEL } = await import("@/lib/analytics")
const { listOrdersForExport } = await import("@/lib/orders")
const { compareValues } = await import("@/lib/admin-analytics")

const run = Array.from({ length: 10 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")
const day = (date: string) => new Date(`${date}T00:00:00Z`)
const CODE = `ANL${run.toUpperCase()}`

let categoryId: string
let categoryName: string
const userIds: string[] = []
const emails: Record<"ada" | "ben" | "cyd", string> = { ada: "", ben: "", cyd: "" }
const productIds: Record<"mug" | "lamp", string> = { mug: "", lamp: "" }
const numbers: Record<string, string> = {}

async function makeUser(key: keyof typeof emails, firstName: string) {
  const email = `analytics-${run}-${key}@example.com`
  const { rows } = await query<{ id: string }>(
    `INSERT INTO users (first_name, last_name, email, password_hash)
     VALUES ($1, 'Tester', $2, 'not-a-real-hash') RETURNING id`,
    [firstName, email],
  )
  userIds.push(rows[0].id)
  emails[key] = email
  return rows[0].id
}

async function makeProduct(key: keyof typeof productIds, name: string, price: number) {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO products (slug, name, brand, category_id, short_description, description, price_cents, stock)
     VALUES ($1, $2, 'Testco', $3, 'Short', 'Long description.', $4, 10) RETURNING id`,
    [`analytics-${run}-${key}`, name, categoryId, price],
  )
  productIds[key] = rows[0].id
}

type Line = { product: keyof typeof productIds; quantity: number; unit: number }

/** Inserts an order (and its items) placed at `at`, totals computed from the lines. */
async function placeAt(
  label: string,
  userId: string,
  at: string,
  status: string,
  lines: Line[],
  { shipping = 0, discountCode = null as string | null, discountCents = 0 } = {},
) {
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unit, 0)
  const { rows } = await query<{ id: string; number: string }>(
    `INSERT INTO orders (user_id, status, full_name, line1, city, postal_code, country, phone,
                         shipping_method_id, shipping_method_name, shipping_method_price_cents,
                         payment_method_id, payment_method_name, subtotal_cents, shipping_cents,
                         discount_code, discount_cents, total_cents, created_at, updated_at)
     VALUES ($1, $2, 'Ada Tester', '1 Test Row', 'London', 'EC1A 1BB', 'GB', '+44 20 7946 0958',
             'standard', 'Standard', 599, 'cards', 'Card', $3, $4, $5, $6, $7, $8, $8)
     RETURNING id, number`,
    [userId, status, subtotal, shipping, discountCode, discountCents, subtotal - discountCents + shipping, at],
  )
  for (const [position, line] of lines.entries()) {
    await query(
      `INSERT INTO order_items (order_id, product_id, position, product_name, product_slug, brand,
                                unit_price_cents, quantity, line_total_cents)
       VALUES ($1, $2, $3, $4, $5, 'Testco', $6, $7, $8)`,
      [
        rows[0].id,
        productIds[line.product],
        position,
        line.product === "mug" ? `Mug ${run}` : `Lamp ${run}`,
        `analytics-${run}-${line.product}`,
        line.unit,
        line.quantity,
        line.quantity * line.unit,
      ],
    )
  }
  numbers[label] = rows[0].number
}

beforeAll(async () => {
  categoryName = `Analytics ${run}`
  const { rows } = await query<{ id: string }>(
    "INSERT INTO categories (slug, name, icon, position) VALUES ($1, $2, 'box', 999) RETURNING id",
    [`analytics-${run}`, categoryName],
  )
  categoryId = rows[0].id
  await makeProduct("mug", `Mug ${run}`, 1000)
  await makeProduct("lamp", `Lamp ${run}`, 3000)
  const ada = await makeUser("ada", "Ada")
  const ben = await makeUser("ben", "Ben")
  const cyd = await makeUser("cyd", "Cyd")

  // The previous period (Mar 7–9): Ada's first order, on the last millisecond before Mar 10.
  await placeAt("before", ada, "2001-03-09T23:59:59.999Z", "delivered", [{ product: "mug", quantity: 1, unit: 1000 }])
  // The range (Mar 10–12).
  await placeAt("first", ada, "2001-03-10T00:00:00.000Z", "delivered", [{ product: "mug", quantity: 2, unit: 1000 }], {
    shipping: 500,
  })
  await placeAt("cancelled", cyd, "2001-03-11T12:00:00Z", "cancelled", [{ product: "mug", quantity: 5, unit: 1000 }])
  await placeAt("rejected", cyd, "2001-03-11T13:00:00Z", "rejected", [{ product: "lamp", quantity: 1, unit: 3000 }])
  // 00:59 on Mar 13 in Warsaw (+01:00 in winter) is still Mar 12 in UTC.
  await placeAt("last", ben, "2001-03-13T00:59:59.999+01:00", "pending", [{ product: "lamp", quantity: 1, unit: 3000 }], {
    discountCode: CODE,
    discountCents: 300,
  })
  // Just after the range.
  await placeAt("after", ada, "2001-03-13T00:00:00.000Z", "processing", [{ product: "mug", quantity: 1, unit: 1000 }])

  // The lamp is deleted: its order lines keep their snapshot without a product.
  await query("DELETE FROM products WHERE id = $1", [productIds.lamp])
})

afterAll(async () => {
  await query("DELETE FROM orders WHERE user_id = ANY($1::uuid[])", [userIds])
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds])
  await query("DELETE FROM products WHERE category_id = $1", [categoryId])
  await query("DELETE FROM categories WHERE id = $1", [categoryId])
  await getPool().end()
})

const RANGE = { from: day("2001-03-10"), to: day("2001-03-13") }

describe("getAnalytics", () => {
  it("buckets standing orders by UTC day, with empty days as zeros and the range's edges respected", async () => {
    const report = await getAnalytics(RANGE)

    expect(report.range).toEqual(RANGE)
    expect(report.previous).toEqual({ from: day("2001-03-07"), to: day("2001-03-10") })
    expect(report.currency).toBe("USD")
    expect(report.daily).toEqual([
      { date: "2001-03-10", revenueCents: 2500, orders: 1 },
      // Only cancelled and rejected orders that day.
      { date: "2001-03-11", revenueCents: 0, orders: 0 },
      { date: "2001-03-12", revenueCents: 2700, orders: 1 },
    ])
  })

  it("leaves cancelled and rejected orders out of the totals but counts them by status", async () => {
    const report = await getAnalytics(RANGE)

    expect(report.totals).toEqual({ revenueCents: 5200, orders: 2, averageOrderCents: 2600, newCustomers: 1 })
    expect(report.statusCounts).toEqual({
      pending: 1,
      processing: 0,
      shipped: 0,
      delivered: 1,
      cancelled: 1,
      rejected: 1,
    })
  })

  it("compares with the previous period of the same length", async () => {
    const report = await getAnalytics(RANGE)

    // Ada's first standing order was in the previous period, so only Ben is new; Cyd has none.
    expect(report.previousTotals).toEqual({ revenueCents: 1000, orders: 1, averageOrderCents: 1000, newCustomers: 1 })
    expect(compareValues(report.totals.revenueCents, report.previousTotals!.revenueCents)).toEqual({
      direction: "up",
      percent: 420,
    })
  })

  it("reports zeros for a previous period without orders", async () => {
    const report = await getAnalytics({ from: day("2001-03-08"), to: day("2001-03-10") })

    expect(report.totals).toEqual({ revenueCents: 1000, orders: 1, averageOrderCents: 1000, newCustomers: 1 })
    expect(report.previousTotals).toEqual({ revenueCents: 0, orders: 0, averageOrderCents: 0, newCustomers: 0 })
    expect(compareValues(report.totals.orders, report.previousTotals!.orders)).toEqual({ direction: "new", percent: null })
  })

  it("ranks the top products by units and by sales, keeping deleted products by their snapshot", async () => {
    const report = await getAnalytics(RANGE)

    const mug = { productId: productIds.mug, name: `Mug ${run}`, brand: "Testco", units: 2, revenueCents: 2000 }
    const lamp = { productId: null, name: `Lamp ${run}`, brand: "Testco", units: 1, revenueCents: 3000 }
    expect(report.topByUnits).toEqual([mug, lamp])
    expect(report.topByRevenue).toEqual([lamp, mug])
  })

  it("groups sales by category, with lines of deleted products as their own group", async () => {
    const report = await getAnalytics(RANGE)

    expect(report.categories).toEqual([
      { categoryId: null, name: DELETED_PRODUCTS_LABEL, units: 1, revenueCents: 3000 },
      { categoryId, name: categoryName, units: 2, revenueCents: 2000 },
    ])
  })

  it("totals the discount codes used on standing orders", async () => {
    const report = await getAnalytics(RANGE)

    expect(report.discounts).toEqual({
      totalCents: 300,
      orders: 1,
      topCodes: [{ code: CODE, orders: 1, discountCents: 300 }],
    })
  })

  it("is empty but complete for days without orders", async () => {
    const report = await getAnalytics({ from: day("2001-01-01"), to: day("2001-01-03") })

    expect(report.daily).toEqual([
      { date: "2001-01-01", revenueCents: 0, orders: 0 },
      { date: "2001-01-02", revenueCents: 0, orders: 0 },
    ])
    expect(report.totals).toEqual({ revenueCents: 0, orders: 0, averageOrderCents: 0, newCustomers: 0 })
    expect(report.topByUnits).toEqual([])
    expect(report.topByRevenue).toEqual([])
    expect(report.categories).toEqual([])
    expect(Object.values(report.statusCounts)).toEqual([0, 0, 0, 0, 0, 0])
    expect(report.discounts).toEqual({ totalCents: 0, orders: 0, topCodes: [] })
  })

  it("starts all time on the first order's day and has nothing to compare with", async () => {
    const report = await getAnalytics({ from: null, to: day("2001-03-14") })

    // Nothing is older than this file's orders (the seed and real orders are from this century).
    expect(report.range).toEqual({ from: day("2001-03-09"), to: day("2001-03-14") })
    expect(report.previous).toBeNull()
    expect(report.previousTotals).toBeNull()
    expect(report.daily.map((point) => point.revenueCents)).toEqual([1000, 2500, 0, 2700, 1000])
    expect(report.totals).toEqual({ revenueCents: 7200, orders: 4, averageOrderCents: 1800, newCustomers: 2 })
  })
})

describe("getDailySales and getRevenueTrend", () => {
  it("gives the daily series and the total against the period before", async () => {
    expect(await getDailySales({ from: day("2001-03-12"), to: day("2001-03-14") })).toEqual([
      { date: "2001-03-12", revenueCents: 2700, orders: 1 },
      { date: "2001-03-13", revenueCents: 1000, orders: 1 },
    ])

    const trend = await getRevenueTrend(RANGE)
    expect(trend.revenueCents).toBe(5200)
    expect(trend.previousRevenueCents).toBe(1000)
    expect(trend.daily).toHaveLength(3)
  })
})

describe("listOrdersForExport", () => {
  const exported = async (options: Parameters<typeof listOrdersForExport>[0]) =>
    (await listOrdersForExport({ q: `analytics-${run}`, ...options })).map((order) => order.number)

  it("includes both whole UTC days of from and to, oldest first", async () => {
    expect(await exported({ from: "2001-03-10", to: "2001-03-12" })).toEqual([
      numbers.first,
      numbers.cancelled,
      numbers.rejected,
      numbers.last,
    ])
    expect(await exported({ from: "2001-03-13", to: "2001-03-13" })).toEqual([numbers.after])
    expect(await exported({ to: "2001-03-09" })).toEqual([numbers.before])
  })

  it("filters by status and by customer email, returning the CSV fields", async () => {
    const rows = await listOrdersForExport({ status: "pending", q: emails.ben.toUpperCase() })

    expect(rows).toEqual([
      {
        number: numbers.last,
        createdAt: new Date("2001-03-12T23:59:59.999Z"),
        customerName: "Ben Tester",
        customerEmail: emails.ben,
        status: "pending",
        itemCount: 1,
        subtotalCents: 3000,
        discountCode: CODE,
        discountCents: 300,
        shippingCents: 0,
        totalCents: 2700,
        currency: "USD",
      },
    ])
    expect(await exported({ status: "shipped" })).toEqual([])
  })
})
