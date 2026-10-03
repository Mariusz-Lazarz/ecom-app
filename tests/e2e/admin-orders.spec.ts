import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// Runs against the real local Postgres. Every test signs in with its own throwaway admin and
// customer, and works on orders it creates for that customer (inserted like `placeOrder` does:
// snapshot, pending event, stock taken). afterEach puts back the stock of those orders that weren't
// cancelled or rejected (those already restocked), then deletes the orders and the users. The
// seeded NC-10xx orders are only read. Tests run in parallel (and in both projects), so each one
// uses its own seeded product and checks stock relatively.
const PASSWORD = "secret123"
const PRODUCTS = {
  desktop: {
    walk: "harbor-leather-midnight-slim-wallet",
    reject: "polaris-onestep-instant-camera",
    search: "strider-cloudride-daily-trainer",
  },
  mobile: {
    walk: "harbor-leather-heritage-bifold-wallet",
    reject: "sonvik-loop-on-ear-wireless-headphones",
    search: "kinetic-retro-suede-runner",
  },
} as const

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
  const email = `e2e-admin-orders-${role}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  emails.push(email)
  const hash = await bcrypt.hash(PASSWORD, 4)
  await withDb((db) =>
    db.query(
      "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
      role === "admin" ? ["Grace", "Hopper", email, hash, role] : ["Ada", "Lovelace", email, hash, role],
    ),
  )
  return email
}

/** A paid, pending order of `quantity` × the product for the customer, with its stock taken. */
async function createOrder(email: string, slug: string, quantity = 1): Promise<string> {
  return withDb(async (db) => {
    await db.query("BEGIN")
    try {
      const { rows: products } = await db.query<{
        id: string
        name: string
        brand: string
        price_cents: number
        currency: string
      }>("SELECT id, name, brand, price_cents, currency FROM products WHERE slug = $1 FOR UPDATE", [slug])
      const product = products[0]
      const { rows: users } = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email])
      const subtotal = product.price_cents * quantity
      const { rows: orders } = await db.query<{ id: string; number: string }>(
        `INSERT INTO orders (user_id, full_name, line1, city, postal_code, country, phone,
                             shipping_method_id, shipping_method_name, shipping_method_price_cents,
                             payment_method_id, payment_method_name,
                             subtotal_cents, savings_cents, shipping_cents, total_cents, currency)
         VALUES ($1, 'Ada Lovelace', '12 Analytical Row', 'Warsaw', '00-001', 'PL', '+48 22 123 45 67',
                 'express', 'Express', 1299, 'cards', 'Credit & debit cards', $2, 0, 1299, $3, $4)
         RETURNING id, number`,
        [users[0].id, subtotal, subtotal + 1299, product.currency],
      )
      const order = orders[0]
      await db.query(
        `INSERT INTO order_items (order_id, product_id, position, product_name, product_slug, brand,
                                  unit_price_cents, quantity, line_total_cents)
         VALUES ($1, $2, 0, $3, $4, $5, $6, $7, $8)`,
        [order.id, product.id, product.name, slug, product.brand, product.price_cents, quantity, subtotal],
      )
      await db.query(
        "INSERT INTO order_status_events (order_id, status, actor_user_id, actor_role) VALUES ($1, 'pending', $2, 'customer')",
        [order.id, users[0].id],
      )
      await db.query("UPDATE products SET stock = stock - $2 WHERE id = $1", [product.id, quantity])
      await db.query("COMMIT")
      return order.number
    } catch (err) {
      await db.query("ROLLBACK")
      throw err
    }
  })
}

test.afterEach(async () => {
  const done = emails.splice(0)
  if (done.length === 0) return
  await withDb(async (db) => {
    await db.query("BEGIN")
    try {
      await db.query(
        `UPDATE products p SET stock = p.stock + v.quantity
         FROM (SELECT oi.product_id, SUM(oi.quantity)::int AS quantity
               FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN users u ON u.id = o.user_id
               WHERE u.email = ANY($1) AND o.status NOT IN ('cancelled', 'rejected') AND oi.product_id IS NOT NULL
               GROUP BY oi.product_id) v
         WHERE p.id = v.product_id`,
        [done],
      )
      await db.query("DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))", [done])
      await db.query("DELETE FROM users WHERE email = ANY($1)", [done])
      await db.query("COMMIT")
    } catch (err) {
      await db.query("ROLLBACK")
      throw err
    }
  })
})

const product = (testInfo: TestInfo, use: keyof (typeof PRODUCTS)["desktop"]) =>
  PRODUCTS[testInfo.project.name as keyof typeof PRODUCTS][use]
const toast = (page: Page, title: string) => page.locator("[data-sonner-toast]").filter({ hasText: title })

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
}

async function signedInAs(page: Page, email: string, path = "/") {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(path)}`)
  await signIn(page, email)
  await expect(page).toHaveURL(path)
}

async function stockOf(page: Page, slug: string): Promise<number> {
  const res = await page.request.get(`/api/products/${slug}`)
  expect(res.ok()).toBe(true)
  return (await res.json()).product.stock
}

/** Opens the status dialog for `button`, optionally fills it, confirms, and waits for the new badge. */
async function changeStatus(
  page: Page,
  button: string,
  title: string,
  { note, tracking }: { note?: string; tracking?: "generate" } = {},
) {
  await page.getByRole("button", { name: button, exact: true }).click()
  const dialog = page.getByRole("dialog", { name: title })
  await expect(dialog).toBeVisible()
  let trackingNumber: string | undefined
  if (tracking === "generate") {
    await dialog.getByRole("button", { name: "Generate" }).click()
    const input = dialog.getByLabel("Tracking number")
    await expect(input).toHaveValue(/^NC1Z[A-Z0-9]{12}$/)
    trackingNumber = await input.inputValue()
  }
  if (note) await dialog.getByLabel("Note (optional)").fill(note)
  await dialog.getByRole("button", { name: button, exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(toast(page, "Order updated").last()).toBeVisible()
  return trackingNumber
}

// CSS rather than roles: while a dialog is open, the page behind it is hidden from the accessibility tree.
const heading = (page: Page) => page.locator("main h1").first()
const statusBadge = (page: Page) => heading(page).locator("xpath=following-sibling::*[@data-status]")

async function customerPage(browser: Browser, email: string, path: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signedInAs(page, email, path)
  return { page, close: () => context.close() }
}

test("a signed-in customer gets a 404 on admin pages and sees no Admin link", async ({ page }, testInfo) => {
  const email = await createUser(testInfo, "user")
  await signedInAs(page, email)

  await expect(page.getByRole("banner").getByRole("link", { name: "Admin" })).toHaveCount(0)
  for (const path of ["/admin", "/admin/orders", "/admin/orders/NC-1001"]) {
    const res = await page.goto(path)
    expect(res?.status(), path).toBe(404)
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0)
  }
})

test("a signed-out visitor is sent to the login and back to /admin", async ({ page }, testInfo) => {
  const email = await createUser(testInfo, "admin")

  await page.goto("/admin")
  await expect(page).toHaveURL("/login?callbackUrl=%2Fadmin")
  await signIn(page, email)

  await expect(page).toHaveURL("/admin")
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible()
  await expect(page.getByTestId("stat-total-orders")).toHaveText(/^\d[\d,]*$/)
  await expect(page.getByRole("list", { name: "Orders by status" }).getByRole("link")).toHaveCount(6)

  // The store header links admins to the admin area (in the menu on small screens).
  await page.getByRole("link", { name: /Back to store|Store/ }).click()
  await expect(page).toHaveURL("/")
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Open menu" }).click()
    await page.getByRole("dialog").getByRole("link", { name: "Admin" }).click()
  } else {
    await page.getByRole("banner").getByRole("link", { name: "Admin" }).click()
  }
  await expect(page).toHaveURL("/admin")
})

test("the admin filters the order list by status and searches by number and email", async ({ page }, testInfo) => {
  const admin = await createUser(testInfo, "admin")
  const customer = await createUser(testInfo, "user")
  const first = await createOrder(customer, product(testInfo, "search"))
  const second = await createOrder(customer, product(testInfo, "search"))
  await signedInAs(page, admin, "/admin/orders")

  const filters = page.getByRole("navigation", { name: "Filter by status" })
  await filters.getByRole("link", { name: /^Pending/ }).click()
  await expect(page).toHaveURL("/admin/orders?status=pending")
  await expect(filters.getByRole("link", { name: /^Pending/ })).toHaveAttribute("aria-current", "page")
  const statusCells = page.getByRole("table", { name: "Orders" }).locator("tbody tr td:last-child")
  await expect(statusCells.first()).toBeVisible()
  for (const cell of await statusCells.all()) await expect(cell).toHaveText("Pending")

  const search = page.getByRole("searchbox", { name: "Order number or email" })
  await search.fill(first.toLowerCase())
  await search.press("Enter")
  await expect(page).toHaveURL(`/admin/orders?status=pending&q=${first.toLowerCase()}`)
  const rows = page.getByRole("table", { name: "Orders" }).locator("tbody tr")
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText(first)
  await expect(rows.first()).toContainText(customer)

  // The status chips keep the search.
  await filters.getByRole("link", { name: /^Shipped/ }).click()
  await expect(page).toHaveURL(`/admin/orders?status=shipped&q=${first.toLowerCase()}`)
  await expect(page.getByText("No orders match these filters.")).toBeVisible()

  await filters.getByRole("link", { name: /^All/ }).click()
  await expect(page).toHaveURL(`/admin/orders?q=${first.toLowerCase()}`)
  await search.fill(customer)
  await search.press("Enter")
  await expect(rows).toHaveCount(2)
  // Newest first.
  await expect(rows.nth(0)).toContainText(second)
  await expect(rows.nth(1)).toContainText(first)

  await rows.nth(1).getByRole("link", { name: first }).click()
  await expect(page).toHaveURL(`/admin/orders/${first}`)
  await expect(page.getByRole("heading", { level: 1, name: `Order ${first}` })).toBeVisible()
})

test("the admin walks an order to delivered and the customer sees it with tracking", async ({ page, browser }, testInfo) => {
  const admin = await createUser(testInfo, "admin")
  const customer = await createUser(testInfo, "user")
  const number = await createOrder(customer, product(testInfo, "walk"))
  await signedInAs(page, admin, `/admin/orders/${number}`)

  await expect(page.getByRole("heading", { level: 1, name: `Order ${number}` })).toBeVisible()
  await expect(page.getByRole("main")).toContainText(customer)
  await expect(statusBadge(page)).toHaveText("Pending")

  await changeStatus(page, "Start processing", `Start processing ${number}?`)
  await expect(statusBadge(page)).toHaveText("Processing")
  await expect(page.getByRole("button", { name: "Start processing" })).toHaveCount(0)

  const tracking = await changeStatus(page, "Mark as shipped", `Mark ${number} as shipped?`, {
    tracking: "generate",
    note: "Handed to the courier",
  })
  await expect(statusBadge(page)).toHaveText("Shipped")
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0)

  await changeStatus(page, "Mark as delivered", `Mark ${number} as delivered?`)
  await expect(statusBadge(page)).toHaveText("Delivered")
  await expect(page.getByText("No further actions: this order is final.")).toBeVisible()

  const history = page.getByRole("list", { name: "Order history" }).getByRole("listitem")
  await expect(history).toHaveCount(4)
  await expect(history.nth(0)).toContainText("by Customer")
  await expect(history.nth(2)).toContainText("by Admin")
  await expect(history.nth(2)).toContainText("Handed to the courier")
  await expect(history.nth(2)).toContainText(`Tracking number: ${tracking}`)

  const customerView = await customerPage(browser, customer, `/orders/${number}`)
  try {
    await expect(statusBadge(customerView.page)).toHaveText("Delivered")
    await expect(customerView.page.getByRole("main")).toContainText(`Tracking number${tracking}`)
    await expect(customerView.page.getByRole("list", { name: "Order history" })).toContainText("Handed to the courier")
    await expect(customerView.page.getByRole("list", { name: "Order history" })).not.toContainText("by Admin")
  } finally {
    await customerView.close()
  }
})

test("the admin rejects an order and its stock comes back", async ({ page }, testInfo) => {
  const admin = await createUser(testInfo, "admin")
  const customer = await createUser(testInfo, "user")
  const slug = product(testInfo, "reject")
  const stockBefore = await stockOf(page, slug)
  const number = await createOrder(customer, slug, 2)
  expect(await stockOf(page, slug)).toBe(stockBefore - 2)
  await signedInAs(page, admin, `/admin/orders/${number}`)

  await page.getByRole("button", { name: "Reject order", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: `Reject order ${number}?` })
  await expect(dialog).toContainText("its items go back in stock")
  await expect(dialog.getByLabel("Tracking number")).toHaveCount(0)
  await dialog.getByLabel("Note (optional)").fill("Payment flagged as fraud")
  await dialog.getByRole("button", { name: "Reject order", exact: true }).click()

  await expect(dialog).toBeHidden()
  await expect(toast(page, "Order updated")).toContainText(`Order ${number} is now rejected.`)
  await expect(statusBadge(page)).toHaveText("Rejected")
  await expect(page.getByText("No further actions: this order is final.")).toBeVisible()
  const last = page.getByRole("list", { name: "Order history" }).getByRole("listitem").last()
  await expect(last).toContainText("Rejected")
  await expect(last).toContainText("Payment flagged as fraud")
  expect(await stockOf(page, slug)).toBe(stockBefore)
})

test("a status change that lost a race shows why and the current status", async ({ page }, testInfo) => {
  const admin = await createUser(testInfo, "admin")
  const customer = await createUser(testInfo, "user")
  const number = await createOrder(customer, product(testInfo, "walk"))
  await signedInAs(page, admin, `/admin/orders/${number}`)

  await page.getByRole("button", { name: "Start processing", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: `Start processing ${number}?` })
  await expect(dialog).toBeVisible()
  // Meanwhile, someone else moves it on (cleanup restocks it like any shipped order).
  await withDb((db) => db.query("UPDATE orders SET status = 'shipped' WHERE number = $1", [number]))
  await dialog.getByRole("button", { name: "Start processing", exact: true }).click()

  await expect(dialog.getByRole("alert")).toContainText("This order is shipped and can't be changed to processing.")
  await expect(statusBadge(page)).toHaveText("Shipped")
})
