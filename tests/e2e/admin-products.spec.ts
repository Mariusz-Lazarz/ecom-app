import { randomUUID } from "node:crypto"
import path from "node:path"

import { expect, test, type Page, type TestInfo } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// Runs against the real local Postgres and S3 emulator. Each test signs in with its own throwaway
// user; products it creates carry a per-test slug prefix and are removed in afterEach (if the test
// didn't delete them itself). The uploaded fixture is stored under its content hash, so every run
// reuses the same small bucket object.
const PASSWORD = "secret123"
const FIXTURE = path.join(__dirname, "fixtures", "product.png")

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
const slugPrefixes: string[] = []

async function createUser(testInfo: TestInfo, role: "user" | "admin") {
  const email = `e2e-admin-products-${role}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
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

test.afterEach(async () => {
  const done = emails.splice(0)
  const prefixes = slugPrefixes.splice(0)
  await withDb(async (db) => {
    for (const prefix of prefixes) await db.query("DELETE FROM products WHERE slug LIKE $1", [`${prefix}%`])
    if (done.length > 0) await db.query("DELETE FROM users WHERE email = ANY($1)", [done])
  })
})

async function signedInAs(page: Page, email: string, path: string) {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(path)}`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(path)
}

const toast = (page: Page, title: string) => page.locator("[data-sonner-toast]").filter({ hasText: title })

test("an admin creates a product with a photo, sees it in the store, edits its price and deletes it", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  const email = await createUser(testInfo, "admin")
  // Unique per test run, not just per millisecond: parallel workers of one project (e.g. with
  // --repeat-each) can start this test in the same millisecond, and a shared slug makes the second
  // create fail with "slug taken" while the first one's afterEach deletes the other's product.
  const run = `${testInfo.project.name}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
  const name = `E2E Trail Mug ${run}`
  const slug = `e2e-trail-mug-${run}`
  slugPrefixes.push(slug)

  await signedInAs(page, email, "/admin/products")
  await expect(page.getByRole("heading", { level: 1, name: "Products" })).toBeVisible()
  await page.getByRole("link", { name: "New product" }).click()
  await expect(page).toHaveURL("/admin/products/new")

  await page.getByLabel("Name").fill(name)
  await expect(page.getByLabel("Slug")).toHaveValue(slug)
  await page.getByLabel("Brand").fill("Halden")
  await page.getByRole("combobox", { name: "Category" }).click()
  await page.getByRole("option", { name: "Accessories" }).click()
  await page.getByLabel("Short description").fill("An enamel mug for the trail.")
  await page.getByLabel("Description", { exact: true }).fill("A sturdy enamel mug that survives campfires.")
  await page.getByLabel("Price", { exact: true }).fill("24")
  await page.getByLabel("Compare-at price").fill("20")
  await page.getByLabel("Stock").fill("5")
  await page.getByRole("button", { name: "Add spec" }).click()
  await page.getByLabel("Spec 1 label").fill("Volume")
  await page.getByLabel("Spec 1 value").fill("350 ml")

  await page.getByLabel("Add images").setInputFiles(FIXTURE)
  const image = page.getByRole("listitem", { name: "Image 1" })
  await expect(image.getByText("Primary")).toBeVisible()
  await image.getByLabel("Image 1 alt text").fill("Green trail mug")

  // The compare-at price is below the price: the server says so and keeps what was typed.
  await page.getByRole("button", { name: "Create product" }).click()
  await expect(page.getByText("Compare-at price must be higher than the price, or empty.")).toBeVisible()
  await expect(page.getByLabel("Name")).toHaveValue(name)
  await expect(page.getByLabel("Spec 1 value")).toHaveValue("350 ml")
  await expect(image.getByText("Primary")).toBeVisible()

  await page.getByLabel("Compare-at price").fill("30")
  await page.getByRole("button", { name: "Create product" }).click()
  await expect(page).toHaveURL("/admin/products")
  await expect(toast(page, "Product created")).toBeVisible()

  await page.getByRole("searchbox", { name: "Name, brand or slug" }).fill(run)
  await page.getByRole("button", { name: "Search", exact: true }).click()
  const row = page.getByRole("row").filter({ hasText: name })
  await expect(row).toContainText("$24.00")
  await expect(row).toContainText("5Low")

  // The storefront shows it straight away, photo included.
  await page.goto(`/products/${slug}`)
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
  await expect(page.locator("main")).toContainText("$24.00")
  await expect(page.getByRole("rowheader", { name: "Volume" })).toBeVisible()
  const photo = page.getByRole("img", { name: "Green trail mug" }).first()
  await expect(photo).toBeVisible()
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

  // Edit the price.
  await page.goto("/admin/products?q=" + encodeURIComponent(run))
  await page.getByRole("link", { name }).click()
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
  await expect(page.getByLabel("Price", { exact: true })).toHaveValue("24.00")
  await page.getByLabel("Price", { exact: true }).fill("19.50")
  await page.getByRole("button", { name: "Save changes" }).click()
  await expect(page).toHaveURL("/admin/products")
  await expect(toast(page, "Product saved")).toBeVisible()

  await page.goto(`/products/${slug}`)
  await expect(page.locator("main")).toContainText("$19.50")
  await expect(page.locator("main")).toContainText("$30.00")

  // Delete it.
  await page.goto("/admin/products?q=" + encodeURIComponent(run))
  await page.getByRole("link", { name }).click()
  await page.getByRole("button", { name: "Delete" }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText("Past orders would keep their copy of the name, price and photo.")
  await dialog.getByRole("button", { name: "Delete product" }).click()
  await expect(page).toHaveURL("/admin/products")
  await expect(toast(page, "Product deleted")).toBeVisible()

  const res = await page.goto(`/products/${slug}`)
  expect(res?.status()).toBe(404)
})

test("a signed-in customer gets a 404 on the admin product pages", async ({ page }, testInfo) => {
  const email = await createUser(testInfo, "user")
  await signedInAs(page, email, "/")

  for (const path of ["/admin/products", "/admin/products/new", "/admin/products/5b0e7c1d-2a3f-4b5c-8d9e-0f1a2b3c4d5e"]) {
    const res = await page.goto(path)
    expect(res?.status(), path).toBe(404)
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible()
  }
})
