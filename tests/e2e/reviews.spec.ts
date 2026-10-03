import { expect, test, type Page, type TestInfo } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// Runs against the real local Postgres. Every test works on its own throwaway product (a copy of a
// seeded one, sharing its primary photo) so the average and count are exact, and signs in with
// throwaway accounts; delivered orders are inserted with SQL. afterEach deletes the orders, the
// users (their reviews go with them) and the product.
const PASSWORD = "secret123"
const TEMPLATE_SLUG = "marlowe-pebble-mini-speaker"

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

const created = { emails: [] as string[], slugs: [] as string[] }
const unique = (testInfo: TestInfo) =>
  `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function createProduct(testInfo: TestInfo) {
  const slug = `e2e-reviews-${unique(testInfo)}`
  created.slugs.push(slug)
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string; name: string }>(
      `INSERT INTO products (slug, name, brand, category_id, short_description, description, price_cents, stock)
       -- Its own text, so it doesn't turn up in other tests' searches.
       SELECT $1, 'Review Test Speaker ' || $2, brand, category_id, 'Throwaway product for the review tests.',
              'Throwaway product for the review tests.', price_cents, 20
       FROM products WHERE slug = $3
       RETURNING id, name`,
      [slug, slug.slice(-6), TEMPLATE_SLUG],
    )
    await db.query(
      `INSERT INTO product_images (product_id, storage_key, width, height, alt, position)
       SELECT $1, storage_key, width, height, alt, 0 FROM product_images
       WHERE product_id = (SELECT id FROM products WHERE slug = $2) AND position = 0`,
      [rows[0].id, TEMPLATE_SLUG],
    )
    return { id: rows[0].id, name: rows[0].name, slug }
  })
}

async function createUser(testInfo: TestInfo, role: "user" | "admin", firstName = "Ada", lastName = "Lovelace") {
  const email = `e2e-reviews-${role}-${unique(testInfo)}@example.com`
  created.emails.push(email)
  const hash = await bcrypt.hash(PASSWORD, 4)
  const id = await withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [firstName, lastName, email, hash, role],
    )
    return rows[0].id
  })
  return { id, email }
}

/** A delivered order of the product for the user; returns its number. */
async function deliveredOrder(userId: string, product: { id: string; name: string; slug: string }) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string; number: string }>(
      `INSERT INTO orders (user_id, status, full_name, line1, city, postal_code, country, phone,
                           shipping_method_id, shipping_method_name, shipping_method_price_cents,
                           payment_method_id, payment_method_name, subtotal_cents, shipping_cents, total_cents)
       VALUES ($1, 'delivered', 'Ada Lovelace', '12 Analytical Row', 'London', 'EC1A 1BB', 'GB', '+44 20 7946 0958',
               'standard', 'Standard', 599, 'cards', 'Credit & debit cards', 4900, 0, 4900)
       RETURNING id, number`,
      [userId],
    )
    await db.query(
      `INSERT INTO order_items (order_id, product_id, position, product_name, product_slug, brand,
                                unit_price_cents, quantity, line_total_cents)
       VALUES ($1, $2, 0, $3, $4, 'Marlowe', 4900, 1, 4900)`,
      [rows[0].id, product.id, product.name, product.slug],
    )
    await db.query(
      "INSERT INTO order_status_events (order_id, status, actor_role) VALUES ($1, 'pending', 'customer'), ($1, 'delivered', 'system')",
      [rows[0].id],
    )
    return rows[0].number
  })
}

test.afterEach(async () => {
  const emails = created.emails.splice(0)
  const slugs = created.slugs.splice(0)
  await withDb(async (db) => {
    await db.query("DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))", [emails])
    await db.query("DELETE FROM users WHERE email = ANY($1)", [emails])
    await db.query("DELETE FROM products WHERE slug = ANY($1)", [slugs])
  })
})

const toast = (page: Page, title: string) => page.locator("[data-sonner-toast]").filter({ hasText: title })

async function signedInAs(page: Page, email: string, path: string) {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(path)}`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(path)
}

test("a customer with a delivered order reviews the product and sees the new average", async ({ page }, testInfo) => {
  const product = await createProduct(testInfo)
  const customer = await createUser(testInfo, "user", "Grace", "Hopper")
  const number = await deliveredOrder(customer.id, product)

  // The delivered order links to the review form.
  await signedInAs(page, customer.email, `/orders/${number}`)
  await page.getByRole("link", { name: `Write a review of ${product.name}` }).click()
  await expect(page).toHaveURL(new RegExp(`/products/${product.slug}#write-review$`))

  const reviews = page.locator("#reviews")
  await expect(reviews.getByTestId("review-count")).toHaveText("No reviews yet")

  const form = page.getByRole("form", { name: "Write a review" })
  // Submitting empty shows the errors inline.
  await form.getByRole("button", { name: "Submit review" }).click()
  await expect(form.getByText("Choose a rating from 1 to 5 stars.")).toBeVisible()
  await expect(form.getByText("Give your review a title.")).toBeVisible()

  // Keyboard: focus the first star, then move to 4.
  await form.getByRole("radio", { name: /^1 star/ }).focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("End")
  await page.keyboard.press("ArrowLeft")
  await expect(form.getByRole("radio", { name: /^4 stars/ })).toHaveAttribute("aria-checked", "true")
  await form.getByLabel("Title").fill("Small but loud")
  await form.getByLabel("Review").fill("Fills the kitchen with sound and the battery lasts all weekend.")
  await form.getByRole("button", { name: "Submit review" }).click()

  await expect(toast(page, "Thanks for your review!")).toBeVisible()
  await expect(reviews.getByTestId("review-average")).toHaveText("4.0")
  await expect(reviews.getByTestId("review-count")).toHaveText("Based on 1 review")
  const item = reviews.getByRole("list", { name: "Reviews" }).getByRole("article")
  await expect(item).toContainText("Small but loud")
  await expect(item).toContainText("Grace H.")
  await expect(item).toContainText("Verified purchase")
  await expect(page.getByRole("form", { name: "Edit your review" })).toBeVisible()

  // Editing keeps one review and moves the average.
  const edit = page.getByRole("form", { name: "Edit your review" })
  await edit.getByRole("radio", { name: /^2 stars/ }).click()
  await edit.getByRole("button", { name: "Update review" }).click()
  await expect(toast(page, "Your review has been updated.")).toBeVisible()
  await expect(reviews.getByTestId("review-average")).toHaveText("2.0")
  await expect(reviews.getByTestId("review-count")).toHaveText("Based on 1 review")

  await page.goto(`/orders/${number}`)
  await expect(page.getByRole("link", { name: `Edit your review of ${product.name}` })).toBeVisible()
})

test("a signed-in user without a delivered order is told why they can't review", async ({ page }, testInfo) => {
  const product = await createProduct(testInfo)
  const user = await createUser(testInfo, "user")

  await signedInAs(page, user.email, `/products/${product.slug}`)

  await expect(page.getByTestId("review-not-eligible")).toHaveText(
    "Only customers who received this product can review it.",
  )
  await expect(page.getByRole("form", { name: "Write a review" })).toHaveCount(0)
})

test("a signed-out visitor is offered a login that comes back to the review form", async ({ page }, testInfo) => {
  const product = await createProduct(testInfo)

  await page.goto(`/products/${product.slug}`)

  await expect(page.getByRole("link", { name: "Sign in to write a review" })).toHaveAttribute(
    "href",
    `/login?callbackUrl=${encodeURIComponent(`/products/${product.slug}#write-review`)}`,
  )
})

test("an admin hides a review and the product's average and count change", async ({ page }, testInfo) => {
  const product = await createProduct(testInfo)
  const happy = await createUser(testInfo, "user", "Happy", "Customer")
  const unhappy = await createUser(testInfo, "user", "Grumpy", "Customer")
  const admin = await createUser(testInfo, "admin", "Grace", "Admin")
  const title = `Too quiet ${product.slug.slice(-6)}`
  await withDb(async (db) => {
    await db.query(
      `INSERT INTO reviews (product_id, user_id, rating, title, body, verified)
       VALUES ($1, $2, 5, 'Brilliant', 'Great little speaker for the price.', true),
              ($1, $3, 2, $4, 'Not loud enough for the garden.', true)`,
      [product.id, happy.id, unhappy.id, title],
    )
  })

  await page.goto(`/products/${product.slug}`)
  await expect(page.getByTestId("review-average")).toHaveText("3.5")
  await expect(page.getByTestId("review-count")).toHaveText("Based on 2 reviews")

  await signedInAs(page, admin.email, `/admin/reviews?q=${encodeURIComponent(title)}`)
  const row = page.getByRole("table", { name: "Reviews" }).getByRole("row").filter({ hasText: title })
  await expect(row).toContainText("Published")
  await row.getByRole("button", { name: `Hide review “${title}” by Grumpy Customer` }).click()
  await expect(toast(page, "Review hidden")).toBeVisible()
  await expect(row).toContainText("Hidden")

  await page.goto(`/products/${product.slug}`)
  await expect(page.getByTestId("review-average")).toHaveText("5.0")
  await expect(page.getByTestId("review-count")).toHaveText("Based on 1 review")
  await expect(page.locator("#reviews")).not.toContainText(title)
})
