import { expect, test, type Page, type TestInfo } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// Runs against the real local Postgres. Every test signs in as its own throwaway user. afterEach
// puts back the stock of every order those users placed that wasn't cancelled (cancelling already
// restocks), then deletes the users' orders (items and events go with them) and the users (their
// carts go with them). Tests run in parallel (and in both projects), so every test that changes
// stock buys its own seeded product, and stock changes are always relative.
const PASSWORD = "secret123"
const PRODUCTS = {
  desktop: {
    buy: { slug: "fieldnote-organic-canvas-tote", name: "Organic Canvas Tote", priceCents: 2900 },
    cancel: { slug: "fieldnote-washed-cotton-cap", name: "Washed Cotton Cap", priceCents: 3400 },
  },
  mobile: {
    buy: { slug: "harbor-leather-card-holder", name: "Minimal Card Holder", priceCents: 3900 },
    cancel: { slug: "marlowe-pebble-mini-speaker", name: "Pebble Mini Speaker", priceCents: 5900 },
  },
} as const

const ADDRESS = {
  fullName: "Ada Lovelace",
  line1: "12 Analytical Row",
  city: "Warsaw",
  postalCode: "00-001",
  phone: "+48 22 123 45 67",
}

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

async function createUser(testInfo: TestInfo) {
  const email = `e2e-checkout-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  emails.push(email)
  const hash = await bcrypt.hash(PASSWORD, 4)
  await withDb((db) =>
    db.query("INSERT INTO users (first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4)", [
      "Ada",
      "Lovelace",
      email,
      hash,
    ]),
  )
  return email
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

const product = (testInfo: TestInfo, use: "buy" | "cancel" = "buy") =>
  PRODUCTS[testInfo.project.name as keyof typeof PRODUCTS][use]
const toast = (page: Page, title: string) => page.locator("[data-sonner-toast]").filter({ hasText: title })
const cartLink = (page: Page) => page.getByRole("banner").getByRole("link", { name: /^Cart, / })
const totals = (page: Page) => page.locator('dl[aria-label="Order totals"]')
const totalRow = (page: Page, label: string) => totals(page).locator("div", { has: page.getByText(label, { exact: true }) })

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
}

async function addToCart(page: Page, slug: string, quantity = 1) {
  await page.goto(`/products/${slug}`)
  for (let i = 1; i < quantity; i++) await page.getByRole("button", { name: "Increase quantity", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Quantity", exact: true })).toHaveValue(String(quantity))
  await page.getByRole("button", { name: "Add to cart", exact: true }).click()
  await expect(toast(page, "Added to cart").last()).toBeVisible()
}

async function stockOf(page: Page, slug: string): Promise<number> {
  const res = await page.request.get(`/api/products/${slug}`)
  expect(res.ok()).toBe(true)
  return (await res.json()).product.stock
}

async function fillAddress(page: Page) {
  await page.getByLabel("Full name").fill(ADDRESS.fullName)
  await page.getByLabel("Address", { exact: true }).fill(ADDRESS.line1)
  await page.getByLabel("City").fill(ADDRESS.city)
  await page.getByLabel("Postal code").fill(ADDRESS.postalCode)
  await page.getByRole("combobox", { name: "Country" }).click()
  await page.getByRole("option", { name: "Poland" }).click()
  await page.getByLabel("Phone").fill(ADDRESS.phone)
}

/** Signs a fresh user in, fills their cart with `quantity` of this project's product and opens /checkout. */
async function readyToCheckOut(page: Page, testInfo: TestInfo, quantity = 1, slug = product(testInfo).slug) {
  const email = await createUser(testInfo)
  await page.goto("/login")
  await signIn(page, email)
  await expect(page).toHaveURL("/")
  await addToCart(page, slug, quantity)
  await page.goto("/checkout")
  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible()
  return email
}

async function placeOrder(page: Page) {
  await page.getByRole("button", { name: /^Place order/ }).click()
  await expect(page).toHaveURL(/\/orders\/NC-\d+$/)
  return page.url().split("/").pop()!
}

test("a guest heading to checkout signs in and lands back on the checkout", async ({ page }, testInfo) => {
  const email = await createUser(testInfo)
  const { slug, name } = product(testInfo)
  await addToCart(page, slug)

  await page.goto("/cart")
  await page.getByRole("main").getByRole("link", { name: "Checkout" }).click()

  await expect(page).toHaveURL("/login?callbackUrl=%2Fcheckout")
  await signIn(page, email)

  await expect(page).toHaveURL("/checkout")
  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible()
  // The guest cart was merged into the account at sign-in.
  await expect(page.getByRole("list", { name: "Items in your order" })).toContainText(name)
  // A first order has no address to reuse, but the name comes from the account.
  await expect(page.getByLabel("Full name")).toHaveValue("Ada Lovelace")
})

test("an empty cart can't be checked out", async ({ page }, testInfo) => {
  const email = await createUser(testInfo)
  await page.goto("/login?callbackUrl=%2Fcheckout")
  await signIn(page, email)

  await expect(page).toHaveURL("/cart")
  await expect(page.getByText("Your cart is empty")).toBeVisible()
})

test("places an order: confirmation, empty cart, stock taken, listed in the account", async ({ page }, testInfo) => {
  const { slug, name, priceCents } = product(testInfo)
  const stockBefore = await stockOf(page, slug)
  await readyToCheckOut(page, testInfo, 2)
  const subtotal = (2 * priceCents) / 100

  await fillAddress(page)
  // Two of either product is over $50, so standard shipping is free; express never is.
  await expect(totalRow(page, "Shipping (Standard)")).toContainText("Free")
  await expect(totalRow(page, "Total")).toContainText(`$${subtotal.toFixed(2)}`)
  await page.getByRole("radio", { name: /^Express/ }).click()
  await expect(totalRow(page, "Shipping (Express)")).toContainText("$12.99")
  await expect(totalRow(page, "Total")).toContainText(`$${(subtotal + 12.99).toFixed(2)}`)
  await page.getByRole("radio", { name: /^Digital wallets/ }).click()
  await expect(page.getByText("This is a demo store; no real payment is taken.")).toBeVisible()

  const number = await placeOrder(page)

  await expect(page.getByText("Thank you for your order!")).toBeVisible()
  await expect(page.getByRole("heading", { level: 1, name: `Order ${number}` })).toBeVisible()
  await expect(toast(page, "Order placed")).toContainText(number)
  await expect(page.getByRole("list", { name: "Items" })).toContainText(name)
  await expect(page.locator("address")).toContainText("Poland")
  await expect(page.getByRole("main")).toContainText("Express · 1–2 business days")
  await expect(page.getByRole("main")).toContainText("Digital wallets · paid (demo)")
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 0 items")
  await expect(page.getByTestId("cart-badge")).toHaveCount(0)
  expect(await stockOf(page, slug)).toBe(stockBefore - 2)

  await page.goto("/account")
  await page.getByRole("link", { name: /Your orders/ }).click()
  await expect(page).toHaveURL("/account/orders")
  const row = page.getByRole("list", { name: "Orders" }).getByRole("link").first()
  await expect(row).toContainText(number)
  await expect(row).toContainText("Pending")
  await expect(row).toContainText("2 items")
  await row.click()
  await expect(page).toHaveURL(`/orders/${number}`)

  // The next checkout starts from this order's address.
  await addToCart(page, slug)
  await page.goto("/checkout")
  await expect(page.getByLabel("City")).toHaveValue(ADDRESS.city)
  await expect(page.getByRole("combobox", { name: "Country" })).toContainText("Poland")
})

test("shows validation errors inline and keeps what was typed", async ({ page }, testInfo) => {
  const email = await readyToCheckOut(page, testInfo)

  await page.getByLabel("Full name").fill("Ada Lovelace")
  await page.getByLabel("City").fill("Warsaw")
  await page.getByLabel("Phone").fill("call me")
  await page.getByRole("radio", { name: /^Next day/ }).click()
  await page.getByRole("button", { name: /^Place order/ }).click()

  await expect(page.getByText("Please check the highlighted fields.")).toBeVisible()
  await expect(page.getByText("Please enter a valid phone number.")).toBeVisible()
  await expect(page.getByLabel("Address", { exact: true })).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByLabel("Phone")).toHaveValue("call me")
  await expect(page.getByLabel("City")).toHaveValue("Warsaw")
  await expect(page.getByLabel("City")).not.toHaveAttribute("aria-invalid")
  await expect(page.getByRole("radio", { name: /^Next day/ })).toBeChecked()
  await expect(page).toHaveURL("/checkout")
  const orders = await withDb((db) =>
    db.query("SELECT count(*)::int AS n FROM orders o JOIN users u ON u.id = o.user_id WHERE u.email = $1", [email]),
  )
  expect(orders.rows[0].n).toBe(0)
})

test("a customer cancels a pending order and its stock comes back", async ({ page }, testInfo) => {
  const { slug } = product(testInfo, "cancel")
  await readyToCheckOut(page, testInfo, 1, slug)
  await fillAddress(page)
  const stockBefore = await stockOf(page, slug)
  const number = await placeOrder(page)
  expect(await stockOf(page, slug)).toBe(stockBefore - 1)

  await page.getByRole("button", { name: "Cancel order" }).click()
  const dialog = page.getByRole("alertdialog", { name: `Cancel order ${number}?` })
  await dialog.getByRole("button", { name: "Cancel order" }).click()

  await expect(toast(page, "Order cancelled")).toContainText(`Order ${number} has been cancelled.`)
  await expect(dialog).toBeHidden()
  const history = page.getByRole("list", { name: "Order history" })
  await expect(history.getByRole("listitem").last()).toContainText("Cancelled")
  await expect(history.getByRole("listitem").last()).toContainText("Cancelled by the customer.")
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0)
  expect(await stockOf(page, slug)).toBe(stockBefore)
})
