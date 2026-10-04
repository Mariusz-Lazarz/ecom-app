import { expect, test, type Page, type TestInfo } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// Emails end to end: the app sends through SMTP to Mailpit (docker compose), and the tests read the
// messages back through Mailpit's HTTP API. Skipped when Mailpit isn't reachable. Every test uses
// its own throwaway user; afterEach restocks their orders, deletes their orders and the users, and
// deletes the emails they received.
const MAILPIT_URL = process.env.MAILPIT_URL ?? `http://localhost:${process.env.MAILPIT_UI_PORT ?? 8025}`
const PASSWORD = "secret123"
const PRODUCTS = {
  desktop: { slug: "marlowe-trailblazer-portable-speaker", name: "Trailblazer Portable Speaker" },
  mobile: { slug: "kinetic-gel-stability-runner", name: "Gel Stability Runner" },
} as const

type MailpitSummary = { ID: string; Subject: string; To: { Address: string }[] }
type MailpitMessage = { ID: string; Subject: string; HTML: string; Text: string; To: { Address: string }[] }

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

let mailpitReachable: boolean | undefined
async function checkMailpit() {
  if (mailpitReachable === undefined) {
    try {
      mailpitReachable = (await fetch(`${MAILPIT_URL}/api/v1/messages?limit=1`, { signal: AbortSignal.timeout(3000) })).ok
    } catch {
      mailpitReachable = false
    }
  }
  return mailpitReachable
}

test.beforeEach(async () => {
  test.skip(
    !(await checkMailpit()),
    `Mailpit isn't reachable at ${MAILPIT_URL}: start it with \`docker compose up -d\` to run the email tests.`,
  )
})

const userIds: string[] = []
const emails: string[] = []

async function createUser(testInfo: TestInfo) {
  const email = `e2e-emails-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const hash = await bcrypt.hash(PASSWORD, 4)
  const { rows } = await withDb((db) =>
    db.query<{ id: string }>(
      "INSERT INTO users (first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id",
      ["Ada", "Lovelace", email, hash],
    ),
  )
  userIds.push(rows[0].id)
  emails.push(email)
  return email
}

test.afterEach(async () => {
  const done = userIds.splice(0)
  const addresses = emails.splice(0)
  if (done.length > 0) {
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
  }
  if (addresses.length > 0 && mailpitReachable) {
    const ids = (await listMessages()).filter((m) => m.To.some((to) => addresses.includes(to.Address))).map((m) => m.ID)
    if (ids.length > 0) {
      await fetch(`${MAILPIT_URL}/api/v1/messages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ IDs: ids }),
      })
    }
  }
})

async function listMessages(): Promise<MailpitSummary[]> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`)
  return ((await res.json()) as { messages: MailpitSummary[] }).messages
}

/** Waits for the email to `to` whose subject matches, and returns it in full. */
async function waitForEmail(to: string, subject: string | RegExp): Promise<MailpitMessage> {
  let found: MailpitSummary | undefined
  await expect
    .poll(
      async () => {
        found = (await listMessages()).find(
          (m) =>
            m.To.some((r) => r.Address === to) &&
            (typeof subject === "string" ? m.Subject === subject : subject.test(m.Subject)),
        )
        return Boolean(found)
      },
      { message: `an email to ${to} with subject ${subject}`, timeout: 15_000 },
    )
    .toBe(true)
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${found!.ID}`)
  return (await res.json()) as MailpitMessage
}

const toast = (page: Page, title: string) => page.locator("[data-sonner-toast]").filter({ hasText: title })

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

async function sessionUser(page: Page) {
  const res = await page.request.get("/api/auth/session")
  return (await res.json())?.user ?? null
}

test("resets a forgotten password through the emailed link", async ({ page }, testInfo) => {
  const email = await createUser(testInfo)

  await page.goto("/login")
  await page.getByRole("link", { name: "Forgot password?" }).click()
  await expect(page).toHaveURL("/forgot-password")
  await page.getByLabel("Email").fill(email.toUpperCase())
  await page.getByRole("button", { name: "Send reset link" }).click()
  await expect(page.getByRole("status")).toContainText(`If an account exists for ${email}`)

  const message = await waitForEmail(email, "Reset your Northcart password")
  expect(message.Text).toContain("Hi Ada,")
  const link = /https?:\/\/[^\s"]+\/reset-password\?token=[A-Za-z0-9_-]{43}/.exec(message.Text)?.[0]
  expect(link, "the email links to /reset-password with a token").toBeTruthy()
  expect(message.HTML).toContain(link!)
  // The link is absolute (APP_URL); open its path on the server under test.
  const { pathname, search } = new URL(link!)

  await page.goto(pathname + search)
  await expect(page.getByText("Pick a password you don't use anywhere else.")).toBeVisible()
  await page.getByLabel("New password", { exact: true }).fill("fresh-pass-42")
  await page.getByLabel("Confirm new password").fill("fresh-pass-43")
  await page.getByRole("button", { name: "Set new password" }).click()
  await expect(page.getByText("Passwords don't match.")).toBeVisible()

  await page.getByLabel("New password", { exact: true }).fill("fresh-pass-42")
  await page.getByLabel("Confirm new password").fill("fresh-pass-42")
  await page.getByRole("button", { name: "Set new password" }).click()
  await expect(page).toHaveURL("/login")
  await expect(toast(page, "Password updated")).toBeVisible()

  // The old password no longer works; the new one does.
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByText("Invalid email or password.")).toBeVisible()
  await signIn(page, email, "fresh-pass-42")
  await expect(page).toHaveURL("/")
  expect(await sessionUser(page)).toMatchObject({ email })

  // The link works once.
  await page.goto(pathname + search)
  await expect(page.getByText("This password reset link is invalid or has expired.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password")
})

test("answers the same for an email without an account and sends nothing", async ({ page }) => {
  const email = `e2e-emails-nobody-${Date.now()}@example.com`
  emails.push(email)

  await page.goto("/forgot-password")
  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Send reset link" }).click()
  await expect(page.getByRole("status")).toContainText(`If an account exists for ${email}`)

  // Give a (wrongly) sent email time to arrive.
  await page.waitForTimeout(1500)
  expect((await listMessages()).filter((m) => m.To.some((to) => to.Address === email))).toHaveLength(0)
})

test("emails the order confirmation to the customer who placed it", async ({ page }, testInfo) => {
  const email = await createUser(testInfo)
  const product = PRODUCTS[testInfo.project.name as keyof typeof PRODUCTS]
  await signIn(page, email)
  await expect(page).toHaveURL("/")

  await page.goto(`/products/${product.slug}`)
  await page.getByRole("button", { name: "Add to cart", exact: true }).click()
  await expect(toast(page, "Added to cart").last()).toBeVisible()
  await page.goto("/checkout")
  await page.getByLabel("Full name").fill("Ada Lovelace")
  await page.getByLabel("Address", { exact: true }).fill("12 Analytical Row")
  await page.getByLabel("City").fill("Warsaw")
  await page.getByLabel("Postal code").fill("00-001")
  await page.getByRole("combobox", { name: "Country" }).click()
  await page.getByRole("option", { name: "Poland" }).click()
  await page.getByLabel("Phone").fill("+48 22 123 45 67")
  await page.getByRole("button", { name: /^Place order/ }).click()
  await expect(page).toHaveURL(/\/orders\/NC-\d+$/)
  const number = page.url().split("/").pop()!

  const message = await waitForEmail(email, `Order ${number} confirmed`)
  expect(message.Text).toContain(product.name)
  expect(message.Text).toContain("Poland")
  expect(message.Text).toMatch(new RegExp(`https?://[^\\s]+/orders/${number}`))
  expect(message.HTML).toContain(product.name)
})
