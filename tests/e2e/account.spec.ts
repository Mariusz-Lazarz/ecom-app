import { expect, test, type Page, type TestInfo } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// Runs against the real local Postgres. Every test signs in as its own throwaway user. afterEach
// puts back the stock of the orders those users placed, then deletes their orders and the users
// (their addresses and carts go with them). Emails can change during a test, so users are tracked
// by id.
const PASSWORD = "secret123"
const PRODUCTS = {
  desktop: { slug: "harbor-leather-midnight-slim-wallet", name: "Midnight Slim Wallet" },
  mobile: { slug: "polaris-onestep-instant-camera", name: "OneStep Instant Camera" },
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

const userIds: string[] = []

async function createUser(testInfo: TestInfo) {
  const email = `e2e-account-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const hash = await bcrypt.hash(PASSWORD, 4)
  const { rows } = await withDb((db) =>
    db.query<{ id: string }>(
      "INSERT INTO users (first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id",
      ["Ada", "Lovelace", email, hash],
    ),
  )
  userIds.push(rows[0].id)
  return email
}

test.afterEach(async () => {
  const done = userIds.splice(0)
  if (done.length === 0) return
  await withDb(async (db) => {
    await db.query("BEGIN")
    try {
      await db.query(
        `UPDATE products p SET stock = p.stock + v.quantity
         FROM (SELECT oi.product_id, SUM(oi.quantity)::int AS quantity
               FROM order_items oi JOIN orders o ON o.id = oi.order_id
               WHERE o.user_id = ANY($1::uuid[]) AND o.status NOT IN ('cancelled', 'rejected') AND oi.product_id IS NOT NULL
               GROUP BY oi.product_id) v
         WHERE p.id = v.product_id`,
        [done],
      )
      await db.query("DELETE FROM orders WHERE user_id = ANY($1::uuid[])", [done])
      await db.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [done])
      await db.query("COMMIT")
    } catch (err) {
      await db.query("ROLLBACK")
      throw err
    }
  })
})

const toast = (page: Page, title: string) => page.locator("[data-sonner-toast]").filter({ hasText: title })
const accountNav = (page: Page) => page.getByRole("navigation", { name: "Account" })

async function sessionUser(page: Page) {
  const res = await page.request.get("/api/auth/session")
  return (await res.json())?.user ?? null
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

// The toast can show (it follows the flash cookie) before the form has its new state, so wait for
// the action to finish before typing again: the form remounts with the action's values.
async function saveProfile(page: Page) {
  await page.getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByRole("button", { name: "Saving…" })).toHaveCount(0)
}

test("changes the name and email, and the session follows without signing in again", async ({ page }, testInfo) => {
  const email = await createUser(testInfo)
  await signIn(page, email)
  await expect(page).toHaveURL("/")

  await page.goto("/account")
  await expect(page.getByRole("heading", { level: 1, name: "Hey Ada, welcome back!" })).toBeVisible()
  await accountNav(page).getByRole("link", { name: "Profile" }).click()
  await expect(page).toHaveURL("/account/profile")
  await expect(accountNav(page).getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page")

  await page.getByLabel("First name").fill("Augusta")
  await page.getByLabel("Last name").fill("King")
  await saveProfile(page)
  await expect(toast(page, "Profile updated")).toBeVisible()
  expect(await sessionUser(page)).toMatchObject({ name: "Augusta King", email })

  // An email change needs the current password; a wrong one is refused inline.
  const newEmail = email.replace("e2e-account-", "e2e-account-new-")
  await page.getByLabel("Email").fill(newEmail.toUpperCase())
  await page.getByLabel("Current password").fill("wrong-pass1")
  await saveProfile(page)
  await expect(page.getByText("Your current password is incorrect.")).toBeVisible()
  await expect(page.getByLabel("Current password")).toHaveValue("")
  await expect(page.getByLabel("Email")).toHaveValue(newEmail.toUpperCase())

  await page.getByLabel("Current password").fill(PASSWORD)
  await saveProfile(page)
  await expect(toast(page, "Profile updated").last()).toBeVisible()
  await expect(page.getByLabel("Email")).toHaveValue(newEmail)
  await expect(page.getByLabel("Current password")).toHaveCount(0)
  expect(await sessionUser(page)).toMatchObject({ name: "Augusta King", email: newEmail })

  await accountNav(page).getByRole("link", { name: "Overview" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Hey Augusta, welcome back!" })).toBeVisible()
})

test("changes the password, stays signed in and signs in with the new one", async ({ page }, testInfo) => {
  const email = await createUser(testInfo)
  await signIn(page, email)
  await expect(page).toHaveURL("/")

  await page.goto("/account/security")
  await expect(page.getByText(/^Member since /)).toBeVisible()

  await page.getByLabel("Current password").fill("wrong-pass1")
  await page.getByLabel("New password", { exact: true }).fill("better-pass2")
  await page.getByLabel("Confirm new password").fill("better-pass2")
  await page.getByRole("button", { name: "Change password" }).click()
  await expect(page.getByText("Your current password is incorrect.")).toBeVisible()
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue("")

  await page.getByLabel("Current password").fill(PASSWORD)
  await page.getByLabel("New password", { exact: true }).fill("better-pass2")
  await page.getByLabel("Confirm new password").fill("better-pass2")
  await page.getByRole("button", { name: "Change password" }).click()
  await expect(toast(page, "Password changed")).toBeVisible()
  expect(await sessionUser(page)).toMatchObject({ email })

  await page.goto("/account")
  await page.getByRole("button", { name: "Log out" }).click()
  await expect(page).toHaveURL("/")

  await signIn(page, email, PASSWORD)
  await expect(page.getByText("Invalid email or password.")).toBeVisible()
  await signIn(page, email, "better-pass2")
  await expect(page).toHaveURL("/")
  expect(await sessionUser(page)).toMatchObject({ email })
})

async function addAddress(
  page: Page,
  address: { label: string; line1: string; city: string; postalCode: string; country: string; phone: string },
) {
  await page.getByRole("button", { name: "Add address" }).click()
  const dialog = page.getByRole("dialog", { name: "Add an address" })
  await expect(dialog.getByLabel("Full name")).toHaveValue("Ada Lovelace")
  await dialog.getByLabel("Label").fill(address.label)
  await dialog.getByLabel("Address", { exact: true }).fill(address.line1)
  await dialog.getByLabel("City").fill(address.city)
  await dialog.getByLabel("Postal code").fill(address.postalCode)
  await dialog.getByRole("combobox", { name: "Country" }).click()
  await page.getByRole("option", { name: address.country }).click()
  await dialog.getByLabel("Phone").fill(address.phone)
  await dialog.getByRole("button", { name: "Save address" }).click()
  await expect(dialog).toBeHidden()
  await expect(toast(page, "Address saved").last()).toBeVisible()
}

test("saves two addresses, makes the second the default and checks out with it", async ({ page }, testInfo) => {
  const email = await createUser(testInfo)
  const product = PRODUCTS[testInfo.project.name as keyof typeof PRODUCTS]
  await signIn(page, email)
  await expect(page).toHaveURL("/")

  await page.goto("/account/addresses")
  await expect(page.getByText("No saved addresses yet")).toBeVisible()

  await addAddress(page, {
    label: "Home",
    line1: "12 Analytical Row",
    city: "London",
    postalCode: "EC1A 1BB",
    country: "United Kingdom",
    phone: "+44 20 7946 0958",
  })
  await addAddress(page, {
    label: "Studio",
    line1: "ul. Floriańska 15",
    city: "Kraków",
    postalCode: "31-019",
    country: "Poland",
    phone: "+48 600 100 200",
  })

  const cards = page.getByRole("list", { name: "Saved addresses" }).getByRole("listitem")
  await expect(cards).toHaveCount(2)
  // The first address saved became the default.
  await expect(cards.nth(0)).toContainText("Home")
  await expect(cards.nth(0)).toContainText("Default")
  await expect(page.getByText("2 of 10 saved.")).toBeVisible()

  await page.getByRole("button", { name: "Set Studio as default" }).click()
  await expect(toast(page, "Studio is now your default address")).toBeVisible()
  await expect(cards.nth(0)).toContainText("Studio")
  await expect(cards.nth(0)).toContainText("Default")
  await expect(cards.nth(1)).not.toContainText("Default")

  await page.goto(`/products/${product.slug}`)
  await page.getByRole("button", { name: "Add to cart", exact: true }).click()
  await expect(toast(page, "Added to cart").last()).toBeVisible()
  await page.goto("/checkout")

  const picker = page.getByRole("radiogroup", { name: "Shipping address" })
  await expect(picker.getByRole("radio", { name: /^Studio/ })).toBeChecked()
  await expect(picker.getByRole("radio", { name: /^Home/ })).not.toBeChecked()
  await expect(page.getByLabel("City")).toHaveCount(0)

  await page.getByRole("button", { name: /^Place order/ }).click()
  await expect(page).toHaveURL(/\/orders\/NC-\d+$/)
  await expect(page.locator("address")).toContainText("ul. Floriańska 15")
  await expect(page.locator("address")).toContainText("Poland")
  await expect(page.getByRole("list", { name: "Items" })).toContainText(product.name)
})
