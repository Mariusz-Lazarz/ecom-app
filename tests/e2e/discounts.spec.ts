import { expect, test, type Page, type TestInfo } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// Runs against the real local Postgres with the seeded discount codes (WELCOME10, EXPIRED5). Every
// test signs in as its own throwaway user. afterEach puts back the stock of their orders that weren't
// cancelled, deletes their orders (redemptions, items and events go with them), the users (their
// carts go with them) and any code a test created. Each project buys its own product, and stock
// changes are always relative, so the tests can run in parallel with the checkout tests.
const PASSWORD = "secret123"
const PRODUCTS = {
  desktop: { slug: "harbor-leather-full-grain-belt", priceCents: 8900 },
  mobile: { slug: "tern-field-canvas-messenger-bag", priceCents: 8900 },
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
const codes: string[] = []

async function createUser(testInfo: TestInfo, role: "user" | "admin" = "user") {
  const email = `e2e-discounts-${role}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  emails.push(email)
  const hash = await bcrypt.hash(PASSWORD, 4)
  await withDb((db) =>
    db.query(
      "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ('Ada', 'Lovelace', $1, $2, $3)",
      [email, hash, role],
    ),
  )
  return email
}

test.afterEach(async () => {
  const done = emails.splice(0)
  const created = codes.splice(0)
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
      await db.query("DELETE FROM discount_codes WHERE code = ANY($1)", [created])
      await db.query("COMMIT")
    } catch (err) {
      await db.query("ROLLBACK")
      throw err
    }
  })
})

const product = (testInfo: TestInfo) => PRODUCTS[testInfo.project.name as keyof typeof PRODUCTS]
const toast = (page: Page, title: string) => page.locator("[data-sonner-toast]").filter({ hasText: title })
const totals = (page: Page) => page.locator('dl[aria-label="Order totals"]')
const totalRow = (page: Page, label: string) => totals(page).locator("div", { has: page.getByText(label, { exact: true }) })
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

async function signIn(page: Page, email: string, path = "/") {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(path)}`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(path)
}

async function addToCart(page: Page, slug: string) {
  await page.goto(`/products/${slug}`)
  await page.getByRole("button", { name: "Add to cart", exact: true }).click()
  await expect(toast(page, "Added to cart").last()).toBeVisible()
}

async function fillAddress(page: Page) {
  await page.getByLabel("Full name").fill("Ada Lovelace")
  await page.getByLabel("Address", { exact: true }).fill("12 Analytical Row")
  await page.getByLabel("City").fill("Warsaw")
  await page.getByLabel("Postal code").fill("00-001")
  await page.getByLabel("Phone").fill("+48 22 123 45 67")
}

async function applyCode(page: Page, code: string) {
  await page.getByLabel("Discount code").fill(code)
  await page.getByRole("button", { name: "Apply" }).click()
}

test("a customer applies WELCOME10 at checkout, places the order and sees the discount on it", async ({
  page,
}, testInfo) => {
  const { slug, priceCents } = product(testInfo)
  const email = await createUser(testInfo)
  await signIn(page, email)
  await addToCart(page, slug)
  await page.goto("/checkout")
  await fillAddress(page)

  await expect(totalRow(page, "Total")).toContainText(money(priceCents))
  await applyCode(page, "welcome10")

  await expect(toast(page, "WELCOME10 applied")).toBeVisible()
  const discount = Math.floor((priceCents * 10 + 50) / 100)
  await expect(totalRow(page, "Discount (WELCOME10)")).toContainText(`−${money(discount)}`)
  await expect(totalRow(page, "Total")).toContainText(money(priceCents - discount))
  await expect(page.getByRole("button", { name: /^Place order/ })).toContainText(money(priceCents - discount))
  await expect(page.getByRole("button", { name: "Remove discount code WELCOME10" })).toBeVisible()
  // What the user typed in the address survives the re-render.
  await expect(page.getByLabel("City")).toHaveValue("Warsaw")

  // The code is stored in the cart, so the cart page shows it too.
  await page.goto("/cart")
  await expect(page.locator('dl[aria-label="Order summary"]')).toContainText(`Discount (WELCOME10)−${money(discount)}`)
  await page.goto("/checkout")
  await expect(totalRow(page, "Discount (WELCOME10)")).toBeVisible()
  await fillAddress(page)

  await page.getByRole("button", { name: /^Place order/ }).click()
  await expect(page).toHaveURL(/\/orders\/NC-\d+$/)
  await expect(page.getByText("Thank you for your order!")).toBeVisible()
  await expect(totalRow(page, "Discount (WELCOME10)")).toContainText(`−${money(discount)}`)
  await expect(totalRow(page, "Total")).toContainText(money(priceCents - discount))

  // WELCOME10 is one use per customer.
  await addToCart(page, slug)
  await page.goto("/checkout")
  await applyCode(page, "WELCOME10")
  await expect(page.getByText("You've already used WELCOME10.")).toBeVisible()
})

test("an expired code is refused with its reason and changes nothing", async ({ page }, testInfo) => {
  const { slug, priceCents } = product(testInfo)
  const email = await createUser(testInfo)
  await signIn(page, email)
  await addToCart(page, slug)
  await page.goto("/checkout")

  await applyCode(page, "EXPIRED5")

  await expect(page.getByText("EXPIRED5 has expired.")).toBeVisible()
  await expect(page.getByLabel("Discount code")).toHaveAttribute("aria-invalid", "true")
  await expect(totals(page).getByText(/^Discount/)).toHaveCount(0)
  await expect(totalRow(page, "Total")).toContainText(money(priceCents))
})

test("an admin creates a code and a customer can use it at checkout", async ({ page }, testInfo) => {
  const { slug, priceCents } = product(testInfo)
  const code = `E2E${testInfo.project.name.toUpperCase()}${Date.now().toString(36).toUpperCase()}`
  codes.push(code)
  const email = await createUser(testInfo, "admin")

  await signIn(page, email, "/admin/discounts")
  await expect(page.getByRole("heading", { level: 1, name: "Discount codes" })).toBeVisible()
  await page.getByRole("link", { name: "New code" }).click()
  await expect(page).toHaveURL("/admin/discounts/new")

  // A first try with an out-of-range value shows the error inline.
  await page.getByLabel("Code", { exact: true }).fill(code.toLowerCase())
  await page.getByLabel("Percent off").fill("120")
  await page.getByRole("button", { name: "Create code" }).click()
  await expect(page.getByText("Percent off must be a whole number from 1 to 100.")).toBeVisible()
  await expect(page.getByLabel("Code", { exact: true })).toHaveValue(code.toLowerCase())

  await page.getByLabel("Percent off").fill("25")
  await page.getByLabel("Minimum subtotal").fill("20")
  await page.getByRole("button", { name: "Create code" }).click()

  await expect(page).toHaveURL("/admin/discounts")
  await expect(toast(page, "Discount code created")).toContainText(code)
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: code }) })
  await expect(row).toContainText("25% off")
  await expect(row).toContainText("Orders over $20.00")
  await expect(row).toContainText("0 / ∞")
  await expect(row).toContainText("Active")

  // The admin shops with it like any customer.
  await addToCart(page, slug)
  await page.goto("/checkout")
  await applyCode(page, code)
  const discount = Math.floor((priceCents * 25 + 50) / 100)
  await expect(totalRow(page, `Discount (${code})`)).toContainText(`−${money(discount)}`)
  await expect(totalRow(page, "Total")).toContainText(money(priceCents - discount))

  // Deactivating it in the admin drops it from the cart on the next visit, with the reason.
  await page.goto("/admin/discounts")
  await row.getByRole("switch", { name: `${code} active` }).click()
  await expect(toast(page, `${code} is now inactive.`)).toBeVisible()
  await page.goto("/checkout")
  await expect(page.getByRole("status").filter({ hasText: "Discount code removed" })).toContainText(
    `${code} is no longer available.`,
  )
  await expect(totals(page).getByText(/^Discount/)).toHaveCount(0)
})
