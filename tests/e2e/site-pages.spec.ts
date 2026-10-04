import { expect, test, type Page, type TestInfo } from "@playwright/test"
import bcrypt from "bcryptjs"
import pg from "pg"

// The content pages, the newsletter and the contact form end to end. Emails are read back through
// Mailpit's HTTP API (those tests are skipped when it isn't reachable). Every test uses addresses
// unique to it and its own x-forwarded-for IP (so the contact rate limit doesn't see the other
// project's run); afterEach deletes the subscribers, messages, users and emails it created.
const MAILPIT_URL = process.env.MAILPIT_URL ?? `http://localhost:${process.env.MAILPIT_UI_PORT ?? 8025}`
const PASSWORD = "secret123"

type MailpitSummary = { ID: string; Subject: string; To: { Address: string }[] }
type MailpitMessage = { ID: string; Subject: string; HTML: string; Text: string }

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

const addresses: string[] = []
const unique = (testInfo: TestInfo, label: string) => {
  const email = `e2e-site-${label}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  addresses.push(email)
  return email
}
/** A made-up client IP for this test (documentation range), sent as x-forwarded-for. */
const fakeIp = () => `198.51.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`
// Subject fragments of the support inbox's notifications this test caused ("… from <name>").
const senderNames: string[] = []

async function listMessages(): Promise<MailpitSummary[]> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`)
  return ((await res.json()) as { messages: MailpitSummary[] }).messages
}

async function waitForEmail(to: string, subject: string): Promise<MailpitMessage> {
  let found: MailpitSummary | undefined
  await expect
    .poll(
      async () => {
        found = (await listMessages()).find((m) => m.To.some((r) => r.Address === to) && m.Subject === subject)
        return Boolean(found)
      },
      { message: `an email to ${to} with subject ${subject}`, timeout: 15_000 },
    )
    .toBe(true)
  return (await (await fetch(`${MAILPIT_URL}/api/v1/message/${found!.ID}`)).json()) as MailpitMessage
}

test.afterEach(async () => {
  const done = addresses.splice(0)
  const names = senderNames.splice(0)
  if (done.length === 0) return
  await withDb(async (db) => {
    await db.query("DELETE FROM newsletter_subscribers WHERE email = ANY($1::text[])", [done])
    await db.query("DELETE FROM contact_messages WHERE email = ANY($1::text[])", [done])
    await db.query("DELETE FROM users WHERE email = ANY($1::text[])", [done])
  })
  if (await checkMailpit()) {
    // The support inbox's notifications name the sender in the subject.
    const ids = (await listMessages())
      .filter((m) => m.To.some((to) => done.includes(to.Address)) || names.some((name) => m.Subject.endsWith(`from ${name}`)))
      .map((m) => m.ID)
    if (ids.length > 0) {
      await fetch(`${MAILPIT_URL}/api/v1/messages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ IDs: ids }),
      })
    }
  }
})

test("every footer and header link leads to a real page", async ({ page, request }) => {
  await page.goto("/")
  const footerLinks = await page.getByRole("contentinfo").getByRole("link").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")!),
  )
  const headerLinks = await page
    .getByRole("banner")
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")!))
  const hrefs = [...new Set([...footerLinks, ...headerLinks])].filter((href) => href.startsWith("/"))
  expect(footerLinks).toEqual(expect.arrayContaining(["/about", "/careers", "/privacy", "/terms", "/help/returns", "/help/contact"]))

  for (const href of hrefs) {
    const res = await request.get(href)
    expect(res.status(), href).toBe(200)
  }
})

test("each help page marks itself in the help nav", async ({ page }) => {
  for (const [path, label] of [
    ["/help/shipping", "Shipping"],
    ["/help/returns", "Returns"],
    ["/help/payments", "Payments"],
    ["/help/contact", "Contact us"],
  ]) {
    await page.goto(path)
    await expect(page.getByRole("navigation", { name: "Help topics" }).getByRole("link", { name: label })).toHaveAttribute(
      "aria-current",
      "page",
    )
  }
  await expect(page).toHaveTitle("Contact us — Northcart")
})

test.describe("with Mailpit", () => {
  test.beforeEach(async () => {
    test.skip(!(await checkMailpit()), `Mailpit isn't reachable at ${MAILPIT_URL}: start it with \`docker compose up -d\`.`)
  })

  test("subscribes from the home page, emails a link, and the link unsubscribes", async ({ page }, testInfo) => {
    const email = unique(testInfo, "news")

    await page.goto("/")
    const field = page.getByLabel("Email address")
    await field.fill(email.toUpperCase())
    await page.getByRole("button", { name: "Subscribe" }).click()
    await expect(page.getByRole("status")).toContainText(`We've sent a confirmation with your welcome code to ${email}.`)

    const message = await waitForEmail(email, "You're on the Northcart list")
    expect(message.Text).toContain("WELCOME10")
    const link = /https?:\/\/[^\s"]+\/newsletter\/unsubscribe\?token=[A-Za-z0-9_-]{43}/.exec(message.Text)?.[0]
    expect(link, "the email links to /newsletter/unsubscribe with a token").toBeTruthy()
    expect(message.HTML).toContain(link!)

    // The link is absolute (APP_URL); open its path on the server under test.
    const { pathname, search } = new URL(link!)
    await page.goto(pathname + search)
    await expect(page.getByRole("heading", { name: "Unsubscribe from the newsletter?" })).toBeVisible()
    await page.getByRole("button", { name: "Unsubscribe" }).click()
    await expect(page.getByRole("status")).toContainText("You've been unsubscribed")
    expect(await withDb(async (db) => (await db.query("SELECT status FROM newsletter_subscribers WHERE email = $1", [email])).rows)).toEqual([
      { status: "unsubscribed" },
    ])

    await page.reload()
    await expect(page.getByRole("status")).toContainText("You're already unsubscribed")

    await page.goto("/newsletter/unsubscribe?token=Xf3k9_-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ")
    await expect(page.getByRole("heading", { name: "This link doesn't work" })).toBeVisible()
  })

  test("a guest's contact message reaches the admin, who marks it read", async ({ page, browser }, testInfo) => {
    const sender = unique(testInfo, "sender")
    const admin = unique(testInfo, "admin")
    await withDb(async (db) =>
      db.query("INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ('Grace', 'Hopper', $1, $2, 'admin')", [
        admin,
        await bcrypt.hash(PASSWORD, 4),
      ]),
    )
    const text = `My parcel hasn't arrived yet (${testInfo.project.name}). Could you check, please?`
    const name = `Chloe Martin-${Math.random().toString(36).slice(2, 8)}`
    senderNames.push(name)

    await page.setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() })
    await page.goto("/help/returns")
    await page.getByRole("link", { name: "Start a return" }).click()
    await expect(page).toHaveURL("/help/contact?topic=returns")
    await expect(page.getByRole("combobox", { name: "Topic" })).toContainText("Returns & refunds")
    await page.getByLabel("Name").fill(name)
    await page.getByLabel("Email").fill(sender)
    await page.getByLabel("Message").fill("Too short")
    await page.getByRole("button", { name: "Send message" }).click()
    await expect(page.getByText("Write at least 10 characters.")).toBeVisible()
    await expect(page.getByLabel("Email")).toHaveValue(sender)

    await page.getByLabel("Order number (optional)").fill("nc-1009")
    await page.getByLabel("Message").fill(text)
    await page.getByRole("button", { name: "Send message" }).click()
    await expect(page.getByRole("status")).toContainText("Thanks, Chloe! We've got your message.")

    const reply = await waitForEmail(sender, "We've got your message")
    expect(reply.Text).toContain(text)
    await waitForEmail("support@northcart.test", `New message: Returns & refunds from ${name}`)

    const adminContext = await browser.newContext()
    const adminPage: Page = await adminContext.newPage()
    try {
      await adminPage.goto("/login?callbackUrl=%2Fadmin%2Fmessages")
      await adminPage.getByLabel("Email").fill(admin)
      await adminPage.getByLabel("Password").fill(PASSWORD)
      await adminPage.getByRole("button", { name: "Sign in" }).click()
      await expect(adminPage).toHaveURL("/admin/messages")
      await expect(adminPage.getByRole("link", { name: /^Messages, \d+ unread$/ })).toBeVisible()

      await adminPage.getByRole("searchbox").fill(sender)
      await adminPage.getByRole("button", { name: "Search" }).click()
      const row = adminPage.getByRole("row").filter({ hasText: sender })
      await expect(row).toContainText("Returns & refunds")
      await expect(row).toContainText("NC-1009")
      await expect(row).toContainText("New")
      await row.getByRole("link", { name }).click()

      await expect(adminPage.getByRole("heading", { level: 1, name: "Returns & refunds" })).toBeVisible()
      await expect(adminPage.getByText(text)).toBeVisible()
      await expect(adminPage.getByRole("link", { name: "Reply by email" })).toHaveAttribute("href", new RegExp(`^mailto:${sender}\\?`))
      await adminPage.getByRole("button", { name: "Mark as read" }).click()
      await expect(adminPage.locator("[data-sonner-toast]").filter({ hasText: "The message is marked as read." })).toBeVisible()
      await expect(adminPage.getByRole("button", { name: "Mark as unread" })).toBeVisible()
      expect(
        await withDb(async (db) => (await db.query("SELECT status FROM contact_messages WHERE email = $1", [sender])).rows),
      ).toEqual([{ status: "read" }])
    } finally {
      await adminContext.close()
    }
  })
})

test("the honeypot is invisible and a filled one looks like success but stores nothing", async ({ page }, testInfo) => {
  const sender = unique(testInfo, "bot")
  await page.setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() })
  await page.goto("/help/contact")
  await expect(page.locator('input[name="website"]')).not.toBeInViewport()

  await page.getByLabel("Name").fill("Spam Bot")
  await page.getByLabel("Email").fill(sender)
  await page.getByRole("combobox", { name: "Topic" }).click()
  await page.getByRole("option", { name: "Something else" }).click()
  await page.getByLabel("Message").fill("Buy cheap followers today, best prices!")
  await page.locator('input[name="website"]').fill("https://spam.example", { force: true })
  await page.getByRole("button", { name: "Send message" }).click()

  await expect(page.getByRole("status")).toContainText("We've got your message")
  expect(await withDb(async (db) => (await db.query("SELECT 1 FROM contact_messages WHERE email = $1", [sender])).rows)).toEqual([])
})
