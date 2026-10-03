import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// Runs against the real local Postgres. Every test gets a fresh browser context, so a fresh guest
// cart; afterEach deletes that cart (and the merge test its throwaway user, whose cart cascades).
// Products are seeded ones with plenty of stock; carts never change stock.
const TOTE = { slug: "fieldnote-organic-canvas-tote", name: "Organic Canvas Tote" } // $29.00
const CARD_HOLDER = { slug: "harbor-leather-card-holder", name: "Minimal Card Holder" } // $39.00
const ARIA = { slug: "halden-aria-anc-wireless-headphones", name: "Aria ANC Wireless Headphones" } // $299 (was $349)

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

async function guestCartId(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name === "cart_id")?.value
}

test.afterEach(async ({ context }) => {
  const id = await guestCartId(context)
  if (id) await withDb((db) => db.query("DELETE FROM carts WHERE id = $1 AND user_id IS NULL", [id]))
})

const cartLink = (page: Page) => page.getByRole("banner").getByRole("link", { name: /^Cart, / })
// While a modal is open the rest of the page is hidden from the accessibility tree, so the badge is found by test id.
const badge = (page: Page) => page.locator("header").getByTestId("cart-badge")
const toast = (page: Page, title: string) => page.locator("[data-sonner-toast]").filter({ hasText: title })

async function addFromProductPage(page: Page, slug: string, quantity = 1) {
  await page.goto(`/products/${slug}`)
  const input = page.getByRole("textbox", { name: "Quantity", exact: true })
  for (let i = 1; i < quantity; i++) await page.getByRole("button", { name: "Increase quantity", exact: true }).click()
  await expect(input).toHaveValue(String(quantity))
  await page.getByRole("button", { name: "Add to cart", exact: true }).click()
  await expect(toast(page, "Added to cart").last()).toBeVisible()
}

test("a guest adds two from the product page, and the cart survives a reload", async ({ page }) => {
  await page.goto(`/products/${ARIA.slug}`)
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 0 items")
  await expect(cartLink(page).getByTestId("cart-badge")).toHaveCount(0)

  await addFromProductPage(page, ARIA.slug, 2)

  await expect(toast(page, "Added to cart")).toContainText(ARIA.name)
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 2 items")
  await expect(cartLink(page).getByTestId("cart-badge")).toHaveText("2")

  await page.reload()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 2 items")
  await page.goto("/")
  await expect(cartLink(page).getByTestId("cart-badge")).toHaveText("2")
})

test("quick add from a product card", async ({ page }) => {
  await page.goto(`/products/${CARD_HOLDER.slug}`)
  // Related products are cards with a quick-add button.
  const quickAdd = page.getByRole("button", { name: /^Add .+ to cart$/ }).first()
  const name = (await quickAdd.getAttribute("aria-label"))!.replace(/^Add (.+) to cart$/, "$1")
  await quickAdd.click()

  await expect(toast(page, "Added to cart")).toContainText(name)
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 1 item")
})

test("the mini-cart lists the cart and edits it", async ({ page }) => {
  await addFromProductPage(page, CARD_HOLDER.slug)
  await addFromProductPage(page, TOTE.slug)
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 2 items")

  // The toast's View cart action opens the mini-cart.
  await toast(page, "Added to cart").last().getByRole("button", { name: "View cart" }).click()
  const sheet = page.getByRole("dialog", { name: /^Your cart/ })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByTestId("cart-line")).toHaveCount(2)
  await expect(sheet.getByText("Subtotal").locator("+ dd")).toHaveText("$68.00")

  await sheet.getByRole("button", { name: `Increase quantity of ${TOTE.name}` }).click()
  await expect(sheet.getByRole("textbox", { name: `Quantity of ${TOTE.name}` })).toHaveValue("2")
  await expect(sheet.getByText("Subtotal").locator("+ dd")).toHaveText("$97.00")
  await expect(badge(page)).toHaveText("3")

  // A typed quantity is saved on Enter.
  const input = sheet.getByRole("textbox", { name: `Quantity of ${TOTE.name}` })
  await input.fill("4")
  await input.press("Enter")
  await expect(sheet.getByText("Subtotal").locator("+ dd")).toHaveText("$155.00")
  await expect(badge(page)).toHaveText("5")

  await sheet.getByRole("button", { name: `Remove ${CARD_HOLDER.name}` }).click()
  await expect(sheet.getByTestId("cart-line")).toHaveCount(1)
  await expect(sheet.getByText("Subtotal").locator("+ dd")).toHaveText("$116.00")
  await expect(badge(page)).toHaveText("4")

  // Reopened from the header icon, it reloads the saved cart.
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  await cartLink(page).click()
  await expect(sheet.getByRole("textbox", { name: `Quantity of ${TOTE.name}` })).toHaveValue("4")

  await sheet.getByRole("link", { name: "Go to cart" }).click()
  await expect(page).toHaveURL("/cart")
  await expect(sheet).toBeHidden()
})

test("the mini-cart shows an empty state", async ({ page }) => {
  await page.goto("/")
  await cartLink(page).click()

  const sheet = page.getByRole("dialog", { name: "Your cart" })
  await expect(sheet.getByText("Your cart is empty")).toBeVisible()
  await sheet.getByRole("link", { name: "Browse products" }).click()
  await expect(page).toHaveURL("/products")
})

test("the cart page totals the cart and clears it after confirming", async ({ page }) => {
  await page.goto("/cart")
  await expect(page).toHaveTitle("Your cart — Northcart")
  await expect(page.getByText("Your cart is empty")).toBeVisible()

  await addFromProductPage(page, ARIA.slug)
  await addFromProductPage(page, TOTE.slug)
  await page.goto("/cart")

  const main = page.getByRole("main")
  const summary = main.locator('dl[aria-label="Order summary"]')
  await expect(main.getByTestId("cart-line")).toHaveCount(2)
  await expect(summary.getByText("Subtotal").locator("+ dd")).toHaveText("$328.00")
  await expect(summary.getByText("You save").locator("+ dd")).toHaveText("−$50.00")
  await expect(main.getByText("Free shipping unlocked")).toBeVisible()

  await main.getByRole("button", { name: `Remove ${ARIA.name}` }).click()
  await expect(main.getByTestId("cart-line")).toHaveCount(1)
  await expect(summary.getByText("Subtotal").locator("+ dd")).toHaveText("$29.00")
  await expect(summary.getByText("You save")).toHaveCount(0)
  await expect(main.getByText("$21.00 away from free shipping")).toBeVisible()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 1 item")

  // Backing out of the confirmation keeps the cart.
  await main.getByRole("button", { name: "Clear cart" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Keep shopping" }).click()
  await expect(main.getByTestId("cart-line")).toHaveCount(1)

  await main.getByRole("button", { name: "Clear cart" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Clear cart" }).click()
  await expect(main.getByText("Your cart is empty")).toBeVisible()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 0 items")

  // Cleared for real, not just on screen.
  await page.reload()
  await expect(page.getByRole("main").getByText("Your cart is empty")).toBeVisible()
})

test.describe("signing in", () => {
  const PASSWORD = "secret123"
  const email = `e2e-cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

  test.beforeAll(async () => {
    const hash = await bcrypt.hash(PASSWORD, 4)
    await withDb((db) =>
      db.query("INSERT INTO users (first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4)", [
        "Cart",
        "Tester",
        email,
        hash,
      ]),
    )
  })

  // Deleting the user cascades to their cart.
  test.afterAll(async () => {
    await withDb((db) => db.query("DELETE FROM users WHERE email = $1", [email]))
  })

  test("merges the guest cart into the account", async ({ page, context }) => {
    await addFromProductPage(page, TOTE.slug, 2)
    await expect(cartLink(page)).toHaveAccessibleName("Cart, 2 items")

    await page.goto("/login")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/")

    await expect(cartLink(page)).toHaveAccessibleName("Cart, 2 items")
    expect(await guestCartId(context)).toBeUndefined()
    const lines = await withDb(async (db) => {
      const { rows } = await db.query(
        `SELECT p.slug, ci.quantity FROM users u JOIN carts c ON c.user_id = u.id
         JOIN cart_items ci ON ci.cart_id = c.id JOIN products p ON p.id = ci.product_id WHERE u.email = $1`,
        [email],
      )
      return rows
    })
    expect(lines).toEqual([{ slug: TOTE.slug, quantity: 2 }])

    await page.goto("/cart")
    await expect(page.getByRole("main").getByRole("link", { name: TOTE.name })).toBeVisible()
  })
})
