import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"

import { expect, test, type Page, type TestInfo } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// Runs against the real local Postgres. Each test signs in with its own throwaway admin and adds a
// delivered order for a throwaway customer, placed now, whose only line is a product that "was
// deleted" (no product row, just the snapshot), so no catalogue page or stock changes. afterEach
// deletes the order and the users. Other tests may place orders in parallel, so figures are
// compared with the database rather than with fixed numbers.
const PASSWORD = "secret123"

async function withDb<T>(fn: (client: pg.Client) => Promise<T>) {
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

const emails: string[] = []

async function createUser(testInfo: TestInfo, role: "user" | "admin") {
  const email = `e2e-analytics-${role}-${testInfo.project.name}-${randomUUID().slice(0, 8)}@example.com`
  emails.push(email)
  const hash = await bcrypt.hash(PASSWORD, 4)
  await withDb((db) =>
    db.query(
      "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ('Grace', 'Hopper', $1, $2, $3)",
      [email, hash, role],
    ),
  )
  return email
}

type ThrowawayOrder = { number: string; productName: string; quantity: number; totalCents: number }

/** A delivered order placed now: `quantity` × a deleted product at $1.23, no shipping. */
async function createOrder(email: string, quantity: number): Promise<ThrowawayOrder> {
  const productName = `E2E Analytics Widget ${randomUUID().slice(0, 8)}`
  const unit = 123
  const total = unit * quantity
  const number = await withDb(async (db) => {
    const { rows } = await db.query<{ id: string; number: string }>(
      `INSERT INTO orders (user_id, status, full_name, line1, city, postal_code, country, phone,
                           shipping_method_id, shipping_method_name, shipping_method_price_cents,
                           payment_method_id, payment_method_name, subtotal_cents, shipping_cents, total_cents)
       SELECT id, 'delivered', 'Grace Hopper', '1 Test Row', 'London', 'EC1A 1BB', 'GB', '+44 20 7946 0958',
              'standard', 'Standard', 0, 'cards', 'Card', $2, 0, $2
       FROM users WHERE email = $1
       RETURNING id, number`,
      [email, total],
    )
    await db.query(
      `INSERT INTO order_items (order_id, product_id, position, product_name, product_slug, brand,
                                unit_price_cents, quantity, line_total_cents)
       VALUES ($1, NULL, 0, $2, $3, 'Testco', $4, $5, $6)`,
      [rows[0].id, productName, `e2e-analytics-${randomUUID()}`, unit, quantity, total],
    )
    return rows[0].number
  })
  return { number, productName, quantity, totalCents: total }
}

/** Standing orders and their revenue over the last `days` UTC days, as the analytics page counts them. */
async function expectedTotals(days: number) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ orders: number; revenue: string }>(
      `SELECT count(*)::int AS orders, COALESCE(sum(total_cents), 0)::bigint AS revenue FROM orders
       WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - make_interval(days => $1 - 1)
         AND status NOT IN ('cancelled', 'rejected')`,
      [days],
    )
    return { orders: rows[0].orders, revenueCents: Number(rows[0].revenue) }
  })
}

test.afterEach(async () => {
  const done = emails.splice(0)
  await withDb(async (db) => {
    await db.query("DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))", [done])
    await db.query("DELETE FROM users WHERE email = ANY($1)", [done])
  })
})

async function signedInAs(page: Page, email: string, path: string) {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(path)}`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(path)
}

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)

test("an admin sees a new order in the analytics figures for the chosen range", async ({ page }, testInfo) => {
  const admin = await createUser(testInfo, "admin")
  const customer = await createUser(testInfo, "user")
  // 500 units: far more than any seeded product, so it's among the top sellers by units (the other
  // project's run of this test may add one too).
  const order = await createOrder(customer, 500)

  await signedInAs(page, admin, "/admin")
  await page.getByRole("link", { name: "Analytics" }).first().click()
  await expect(page).toHaveURL("/admin/analytics")
  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "30 days" })).toHaveAttribute("aria-selected", "true")

  await page.getByRole("tab", { name: "7 days" }).click()
  await expect(page).toHaveURL("/admin/analytics?range=7d")
  await expect(page.getByRole("tab", { name: "7 days" })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByText(/vs previous 7 days/).first()).toBeVisible()

  // The KPIs match the database (re-read together, in case another test places an order meanwhile).
  await expect
    .poll(async () => {
      await page.reload()
      const expected = await expectedTotals(7)
      const shown = {
        revenue: await page.getByTestId("kpi-revenue").textContent(),
        orders: await page.getByTestId("kpi-orders").textContent(),
      }
      return shown.revenue === money(expected.revenueCents) && shown.orders === String(expected.orders)
    })
    .toBe(true)

  const topByUnits = page.getByRole("table", { name: "Top products by units" })
  const row = topByUnits.getByRole("row").filter({ hasText: order.productName })
  await expect(row).toContainText(`${order.productName} (deleted)Testco500${money(order.totalCents)}`)
  await expect(page.getByRole("figure", { name: "Sales by category" })).toBeVisible()
  await expect(page.getByRole("figure", { name: "Revenue per day" })).toBeVisible()

  // The export link covers the same days.
  const today = new Date().toISOString().slice(0, 10)
  await expect(page.getByRole("link", { name: "Export orders CSV" })).toHaveAttribute(
    "href",
    new RegExp(`^/api/admin/orders/export\\?from=\\d{4}-\\d{2}-\\d{2}&to=${today}$`),
  )
})

test("an admin exports the filtered orders as CSV", async ({ page, request }, testInfo) => {
  const admin = await createUser(testInfo, "admin")
  const customer = await createUser(testInfo, "user")
  const order = await createOrder(customer, 2)

  await signedInAs(page, admin, "/admin/orders")
  await page.getByRole("searchbox", { name: "Order number or email" }).fill(customer)
  await page.getByRole("searchbox", { name: "Order number or email" }).press("Enter")
  await expect(page).toHaveURL(`/admin/orders?q=${encodeURIComponent(customer)}`)
  await page.getByRole("navigation", { name: "Filter by status" }).getByRole("link", { name: /^Delivered/ }).click()
  await expect(page).toHaveURL(`/admin/orders?status=delivered&q=${encodeURIComponent(customer)}`)
  await expect(page.getByRole("table").getByRole("link", { name: order.number })).toBeVisible()

  const download = page.waitForEvent("download")
  await page.getByRole("link", { name: "Export CSV" }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/)
  const csv = await readFile((await file.path())!, "utf8")
  const lines = csv.split("\r\n")
  expect(lines[0]).toBe(
    "number,date,customer_name,customer_email,status,items,subtotal,discount_code,discount,shipping,total,currency",
  )
  expect(lines).toHaveLength(3)
  expect(lines[1]).toMatch(
    new RegExp(`^${order.number},\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z,Grace Hopper,${customer.replace(/\./g, "\\.")},delivered,2,2\\.46,,0\\.00,0\\.00,2\\.46,USD$`),
  )
  expect(lines[2]).toBe("")

  // Without the admin's session (the request fixture has no cookies) there's no file.
  const res = await request.get(`/api/admin/orders/export?q=${encodeURIComponent(customer)}`)
  expect(res.status()).toBe(401)
})
