import { expect, test } from "@playwright/test"

// Runs against the real local Postgres, so every run registers a fresh address.
function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
}

async function fillForm(page: import("@playwright/test").Page, email: string) {
  await page.getByLabel("First name").fill("Jan")
  await page.getByLabel("Last name").fill("Kowalski")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill("secret123")
  await page.getByLabel("Confirm password").fill("secret123")
  await page.getByRole("button", { name: "Create account" }).click()
}

test("header account icon leads to the registration page", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("link", { name: "Account" }).click()
  await expect(page.getByText("Create your account")).toBeVisible()
})

test("registers a new user and rejects the same email twice", async ({ page }) => {
  const email = uniqueEmail()

  await page.goto("/register")
  await fillForm(page, email)
  await expect(page.getByText("Welcome aboard, Jan!")).toBeVisible()

  await page.goto("/register")
  await fillForm(page, email.toUpperCase())
  await expect(page.getByText("An account with this email already exists.")).toBeVisible()
  await expect(page.getByLabel("First name")).toHaveValue("Jan")
})

test("shows validation errors for a weak password", async ({ page }) => {
  await page.goto("/register")
  await page.getByLabel("First name").fill("Jan")
  await page.getByLabel("Last name").fill("Kowalski")
  await page.getByLabel("Email").fill(uniqueEmail())
  await page.getByLabel("Password", { exact: true }).fill("abc")
  await page.getByLabel("Confirm password").fill("abc")
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page.getByText("Be at least 8 characters long.")).toBeVisible()
  await expect(page.getByText("Contain at least one number.")).toBeVisible()
})
