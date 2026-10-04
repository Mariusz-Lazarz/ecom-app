import { createHash } from "node:crypto"

import { afterAll, describe, expect, it, vi } from "vitest"

// Runs the newsletter module (and the CSV export route) against the docker compose Postgres, on
// addresses unique to this run that are deleted afterwards.
vi.mock("server-only", () => ({}))
// `@/lib/products` (for escapeLike) imports `connection` from next/server.
vi.mock("next/server", () => ({ connection: async () => {} }))
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: "user" | "admin" } } }))
vi.mock("@/auth", () => ({ auth: async () => session.current }))

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const newsletter = await import("@/lib/newsletter")
const { GET: exportCsv } = await import("@/app/api/admin/newsletter/export/route")

const run = Math.random().toString(36).slice(2, 10)
let count = 0
const address = (label = "x") => `nl-${run}-${label}-${count++}@example.com`
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

type Row = { email: string; status: string; source: string; unsubscribe_token_hash: string; confirmation_sent_at: Date }
async function rowsFor(email: string) {
  const { rows } = await query<Row>(
    "SELECT email, status, source, unsubscribe_token_hash, confirmation_sent_at FROM newsletter_subscribers WHERE lower(email) = lower($1)",
    [email],
  )
  return rows
}

/** Moves the address's last confirmation back, out of the sign-up cooldown. */
const age = (email: string) =>
  query("UPDATE newsletter_subscribers SET confirmation_sent_at = confirmation_sent_at - interval '2 minutes' WHERE lower(email) = lower($1)", [email])

async function subscribed(email: string, source = "home") {
  const result = await newsletter.subscribe(email, source)
  if (result.status !== "subscribed") throw new Error(`Expected a sign-up, got ${result.status}`)
  return result
}

afterAll(async () => {
  await query("DELETE FROM newsletter_subscribers WHERE email LIKE $1", [`nl-${run}-%`])
  await getPool().end()
})

describe("subscribe", () => {
  it("stores a new address lower-cased, with the source and only the token's hash", async () => {
    const email = address("new")

    const result = await subscribed(`  ${email.toUpperCase()} `, "register")

    expect(result).toEqual({ status: "subscribed", email, token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) })
    const [row, ...rest] = await rowsFor(email)
    expect(rest).toHaveLength(0)
    expect(row).toMatchObject({ email, status: "subscribed", source: "register", unsubscribe_token_hash: sha256(result.token) })
  })

  it("is idempotent and case-insensitive: a repeat within a minute changes nothing and sends nothing", async () => {
    const email = address("repeat")
    const first = await subscribed(email)
    const [before] = await rowsFor(email)

    expect(await newsletter.subscribe(email.toUpperCase(), "register")).toEqual({ status: "throttled" })

    const [after, ...rest] = await rowsFor(email)
    expect(rest).toHaveLength(0)
    expect(after).toEqual(before)
    expect(after.unsubscribe_token_hash).toBe(sha256(first.token))
  })

  it("re-confirms after the cooldown with a new token, so only the latest link works", async () => {
    const email = address("again")
    const first = await subscribed(email)
    await age(email)

    const second = await subscribed(email.toUpperCase(), "register")

    expect(second.token).not.toBe(first.token)
    const rows = await rowsFor(email)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "subscribed", source: "register", unsubscribe_token_hash: sha256(second.token) })
    expect(await newsletter.findSubscriberByToken(first.token)).toBeNull()
    expect(await newsletter.unsubscribe(first.token)).toEqual({ status: "invalid" })
  })

  it("subscribes an unsubscribed address again straight away", async () => {
    const email = address("back")
    const first = await subscribed(email)
    await newsletter.unsubscribe(first.token)

    const second = await subscribed(email)

    expect((await rowsFor(email))[0].status).toBe("subscribed")
    expect(await newsletter.findSubscriberByToken(second.token)).toEqual({ email, status: "subscribed" })
  })

  it("puts the token in the confirmation email's unsubscribe link", async () => {
    const message = newsletter.newsletterConfirmationMessage("ada@example.com", "abc_DEF-123")
    expect(message.to).toBe("ada@example.com")
    expect(message.text).toMatch(/https?:\/\/[^\s]+\/newsletter\/unsubscribe\?token=abc_DEF-123/)
  })
})

describe("unsubscribe", () => {
  it("unsubscribes only the token's own address, and using the link again is harmless", async () => {
    const mine = address("mine")
    const other = address("other")
    const { token } = await subscribed(mine)
    await subscribed(other)

    expect(await newsletter.unsubscribe(token)).toEqual({ status: "unsubscribed", email: mine })
    expect((await rowsFor(mine))[0].status).toBe("unsubscribed")
    expect((await rowsFor(other))[0].status).toBe("subscribed")

    expect(await newsletter.unsubscribe(token)).toEqual({ status: "already-unsubscribed", email: mine })
    expect(await newsletter.findSubscriberByToken(token)).toEqual({ email: mine, status: "unsubscribed" })
  })

  it("calls an unknown token invalid and changes nothing", async () => {
    const email = address("untouched")
    await subscribed(email)

    expect(await newsletter.unsubscribe("Xf3k9_-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ")).toEqual({ status: "invalid" })
    expect(await newsletter.findSubscriberByToken("Xf3k9_-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ")).toBeNull()
    expect((await rowsFor(email))[0].status).toBe("subscribed")
  })

  it("doesn't accept the token's hash in place of the token", async () => {
    const email = address("hash")
    const { token } = await subscribed(email)

    expect(await newsletter.unsubscribe(sha256(token))).toEqual({ status: "invalid" })
    expect((await rowsFor(email))[0].status).toBe("subscribed")
  })
})

describe("admin list, counts and export", () => {
  it("filters by status and email, newest first, and counts each status", async () => {
    const before = await newsletter.getSubscriberCounts()
    const a = address("list")
    const b = address("list")
    await subscribed(a)
    const { token } = await subscribed(b)
    await newsletter.unsubscribe(token)

    const after = await newsletter.getSubscriberCounts()
    expect(after.subscribed - before.subscribed).toBe(1)
    expect(after.unsubscribed - before.unsubscribed).toBe(1)

    const all = await newsletter.listSubscribers({ q: `nl-${run}-list` })
    expect(all.items.map((s) => s.email)).toEqual([b, a])
    expect(all).toMatchObject({ total: 2, page: 1, pageCount: 1 })
    const unsubscribed = await newsletter.listSubscribers({ q: `nl-${run}-list`, status: "unsubscribed" })
    expect(unsubscribed.items.map((s) => s.email)).toEqual([b])

    const paged = await newsletter.listSubscribers({ q: `nl-${run}-list`, pageSize: 1, page: 2 })
    expect(paged.items.map((s) => s.email)).toEqual([a])
    expect(paged).toMatchObject({ total: 2, pageCount: 2 })
    expect((await newsletter.listSubscribers({ q: `nl-${run}-list`, page: 5 })).items).toEqual([])
  })

  it("treats % and _ in the search literally", async () => {
    expect((await newsletter.listSubscribers({ q: `nl-${run}-%` })).total).toBe(0)
  })

  it("exports subscribed addresses only, as CSV, to admins", async () => {
    const yes = address("csv")
    const no = address("csv")
    await subscribed(yes, "register")
    const { token } = await subscribed(no)
    await newsletter.unsubscribe(token)

    session.current = { user: { id: "admin", role: "admin" } }
    const res = await exportCsv(new Request("http://localhost/api/admin/newsletter/export"), {} as never)

    expect(res.status).toBe(200)
    const lines = (await res.text()).split("\r\n")
    expect(lines[0]).toBe("email,source,subscribed_at")
    expect(lines.at(-1)).toBe("")
    const mine = lines.filter((line) => line.startsWith(`nl-${run}-csv`))
    expect(mine).toEqual([expect.stringMatching(new RegExp(`^${yes.replace(/[.]/g, "\\.")},register,\\d{4}-\\d{2}-\\d{2}T`))])

    session.current = { user: { id: "user", role: "user" } }
    expect((await exportCsv(new Request("http://localhost/api/admin/newsletter/export"), {} as never)).status).toBe(404)
  })
})
