import { expect, test, type Page } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// Runs against the real local Postgres: each worker inserts its own account and removes it afterwards.
const PASSWORD = "secret123"
const email = `e2e-login-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

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

test.beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 4)
  await withDb((db) =>
    db.query("INSERT INTO users (first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4)", [
      "Jan",
      "Kowalski",
      email,
      hash,
    ]),
  )
})

test.afterAll(async () => {
  await withDb((db) => db.query("DELETE FROM users WHERE email = $1", [email]))
})

async function signIn(page: Page, emailValue: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(emailValue)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

async function sessionUser(page: Page) {
  const res = await page.request.get("/api/auth/session")
  return (await res.json())?.user ?? null
}

test("header account icon leads to the sign-in page", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("link", { name: "Account" }).click()
  await expect(page.getByText("Welcome back")).toBeVisible()
  await expect(page).toHaveURL("/login")
})

test("signs in with the right password and lands on the home page", async ({ page }) => {
  // Mixed case on purpose: emails are matched case-insensitively.
  await signIn(page, email.toUpperCase(), PASSWORD)

  await expect(page).toHaveURL("/")
  expect(await sessionUser(page)).toMatchObject({ email, name: "Jan Kowalski" })

  // Signed-in users are bounced away from the sign-in page.
  await page.goto("/login")
  await expect(page).toHaveURL("/")

  // ...and the header account icon now leads to their account page.
  await page.getByRole("link", { name: "Account" }).click()
  await expect(page).toHaveURL("/account")
  await expect(page.getByRole("heading", { name: "Hey Jan, welcome back!" })).toBeVisible()

  // Logging out ends the session and lands back on the home page.
  await page.getByRole("button", { name: "Log out" }).click()
  await expect(page).toHaveURL("/")
  expect(await sessionUser(page)).toBeNull()
  await page.getByRole("link", { name: "Account" }).click()
  await expect(page).toHaveURL("/login")
})

test("account page sends signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/account")
  await expect(page).toHaveURL("/login")
})

test("rejects a wrong password and keeps the user signed out", async ({ page }) => {
  await signIn(page, email, "wrong-pass1")

  await expect(page.getByText("Invalid email or password.")).toBeVisible()
  await expect(page).toHaveURL("/login")
  await expect(page.getByLabel("Email")).toHaveValue(email)
  expect(await sessionUser(page)).toBeNull()
})

test("rejects an unknown email with the same message", async ({ page }) => {
  await signIn(page, "nobody-here@example.com", PASSWORD)
  await expect(page.getByText("Invalid email or password.")).toBeVisible()
  expect(await sessionUser(page)).toBeNull()
})

test("validates the form before hitting the database", async ({ page }) => {
  await signIn(page, "not-an-email", "")
  await expect(page.getByText("Please enter a valid email.")).toBeVisible()
  await expect(page.getByText("Password is required.")).toBeVisible()
})
