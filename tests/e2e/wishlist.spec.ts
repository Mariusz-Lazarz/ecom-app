import { expect, test, type Page, type TestInfo } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// Runs against the real local Postgres. Every test signs in as its own throwaway customer, deleted
// afterwards; their wishlist and cart go with them (ON DELETE CASCADE). The product is a seeded one
// with plenty of stock.
const TOTE = { slug: "fieldnote-organic-canvas-tote", name: "Organic Canvas Tote" }
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

async function makeCustomer(testInfo: TestInfo) {
  const email = `e2e-wish-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  emails.push(email)
  const hash = await bcrypt.hash(PASSWORD, 4)
  await withDb((db) =>
    db.query("INSERT INTO users (first_name, last_name, email, password_hash) VALUES ('Wish', 'Tester', $1, $2)", [
      email,
      hash,
    ]),
  )
  return email
}

test.afterAll(async () => {
  await withDb((db) => db.query("DELETE FROM users WHERE email = ANY($1::text[])", [emails]))
})

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
}

const toast = (page: Page, title: string) => page.locator("[data-sonner-toast]").filter({ hasText: title })
const wishlistLink = (page: Page) => page.getByRole("banner").getByRole("link", { name: /^Wishlist/ })
const cartLink = (page: Page) => page.getByRole("banner").getByRole("link", { name: /^Cart, / })
const searchPath = "/products?q=canvas+tote"

test("a customer saves a product from the catalogue and moves it to the cart", async ({ page }, testInfo) => {
  const email = await makeCustomer(testInfo)
  await page.goto("/login")
  await signIn(page, email)
  await expect(page).toHaveURL("/")
  await expect(wishlistLink(page)).toHaveAccessibleName("Wishlist")
  await expect(wishlistLink(page).getByTestId("wishlist-badge")).toHaveCount(0)

  await page.goto(searchPath)
  await page.getByRole("button", { name: `Save ${TOTE.name} to wishlist` }).click()

  const saved = page.getByRole("button", { name: `Remove ${TOTE.name} from wishlist` })
  await expect(saved).toHaveAttribute("aria-pressed", "true")
  await expect(toast(page, "Saved to your wishlist")).toContainText(TOTE.name)
  await expect(wishlistLink(page)).toHaveAccessibleName("Wishlist, 1 item")
  await expect(wishlistLink(page).getByTestId("wishlist-badge")).toHaveText("1")

  // Saved for real: still filled after a reload.
  await page.reload()
  await expect(saved).toHaveAttribute("aria-pressed", "true")

  await wishlistLink(page).click()
  await expect(page).toHaveURL("/account/wishlist")
  const main = page.getByRole("main")
  await expect(main.getByRole("link", { name: TOTE.name })).toBeVisible()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 0 items")

  await main.getByRole("button", { name: "Move to cart" }).click()

  await expect(toast(page, "Moved to cart")).toContainText(TOTE.name)
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 1 item")
  await expect(page.locator("header").getByTestId("cart-badge")).toHaveText("1")
  await expect(main.getByText("Your wishlist is empty")).toBeVisible()
  await expect(wishlistLink(page).getByTestId("wishlist-badge")).toHaveCount(0)

  await page.reload()
  await expect(main.getByText("Your wishlist is empty")).toBeVisible()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 1 item")
})

test("a guest's heart leads to sign-in and back to the same page", async ({ page }, testInfo) => {
  const email = await makeCustomer(testInfo)
  await page.goto(searchPath)
  await expect(wishlistLink(page)).toHaveCount(0)

  await page.getByRole("button", { name: `Save ${TOTE.name} to wishlist` }).click()

  await expect(page).toHaveURL(`/login?callbackUrl=${encodeURIComponent(searchPath)}`)
  await expect(toast(page, "Sign in to save items")).toBeVisible()

  await signIn(page, email)

  await expect(page).toHaveURL(searchPath)
  await expect(page.getByRole("button", { name: `Save ${TOTE.name} to wishlist` })).toHaveAttribute(
    "aria-pressed",
    "false",
  )
  await expect(wishlistLink(page)).toHaveAccessibleName("Wishlist")
})
