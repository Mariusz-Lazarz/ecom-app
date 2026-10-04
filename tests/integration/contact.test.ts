import { createHash } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Runs the contact messages module against the docker compose Postgres. The messages, the two
// throwaway customers and their orders are deleted afterwards. Every test uses its own sender
// addresses and IPs, so the rate limit only sees what the test itself sends.
vi.mock("server-only", () => ({}))
// `@/lib/products` (for escapeLike) imports `connection` from next/server.
vi.mock("next/server", () => ({ connection: async () => {} }))

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const contact = await import("@/lib/contact")
const users = await import("@/lib/users")
const { NotFoundError } = await import("@/lib/errors")

const run = Math.random().toString(36).slice(2, 10)
let count = 0
const sender = (label = "x") => `contact-${run}-${label}-${count++}@example.com`
const ip = () => `203.0.113.${count++ % 250}-${run}`
const userIds: string[] = []
let ada: { id: string; order: string }
let ben: { id: string; order: string }

async function makeCustomer(name: string) {
  const user = await users.createUser({
    firstName: name,
    lastName: "Test",
    email: `contact-${run}-${name.toLowerCase()}@example.com`,
    password: "secret123",
  })
  userIds.push(user.id)
  const { rows } = await query<{ number: string }>(
    `INSERT INTO orders (user_id, full_name, line1, city, postal_code, country, phone,
                         shipping_method_id, shipping_method_name, shipping_method_price_cents, shipping_cents,
                         payment_method_id, payment_method_name, subtotal_cents, total_cents)
     VALUES ($1, $2, '1 Test St', 'London', 'EC1A 1BB', 'GB', '+44 20 7946 0958',
             'standard', 'Standard', 599, 599, 'cards', 'Card', 1000, 1599)
     RETURNING number`,
    [user.id, `${name} Test`],
  )
  return { id: user.id, order: rows[0].number }
}

const input = (overrides: Partial<Parameters<typeof contact.createContactMessage>[0]> = {}) => ({
  name: "Ada Lovelace",
  email: sender(),
  orderNumber: undefined,
  topic: "order" as const,
  message: "Where is my parcel, please?",
  ...overrides,
})

/** Moves this sender's messages back, out of the rate limit window. */
const age = (email: string) =>
  query("UPDATE contact_messages SET created_at = created_at - interval '2 minutes' WHERE lower(email) = lower($1)", [email])

beforeAll(async () => {
  ada = await makeCustomer("Ada")
  ben = await makeCustomer("Ben")
})

afterAll(async () => {
  await query("DELETE FROM contact_messages WHERE email LIKE $1", [`contact-${run}-%`])
  await query("DELETE FROM orders WHERE user_id = ANY($1::uuid[])", [userIds])
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds])
  await getPool().end()
})

describe("createContactMessage", () => {
  it("stores a guest's message as new, with the email lower-cased and only the IP's hash", async () => {
    const email = sender("guest")
    const address = ip()

    const message = await contact.createContactMessage(
      input({ email: email.toUpperCase(), orderNumber: "NC-424242", topic: "returns" }),
      { userId: null, ip: address },
    )

    expect(message).toMatchObject({
      name: "Ada Lovelace",
      email,
      orderNumber: "NC-424242",
      topic: "returns",
      status: "new",
      userId: null,
    })
    const { rows } = await query<{ ip_hash: string }>("SELECT ip_hash FROM contact_messages WHERE id = $1", [message.id])
    expect(rows[0].ip_hash).toBe(createHash("sha256").update(address).digest("hex"))
    expect(rows[0].ip_hash).not.toContain("203.0.113")
  })

  it("stores a guest's order number as given, even if no such order exists", async () => {
    const message = await contact.createContactMessage(input({ orderNumber: "NC-0" }), { userId: null, ip: null })
    expect(message.orderNumber).toBe("NC-0")
    expect((await contact.getContactMessage(message.id))?.orderExists).toBe(false)
  })

  it("links a signed-in sender's message to their account and accepts their own order in any case", async () => {
    const message = await contact.createContactMessage(input({ orderNumber: ada.order.toLowerCase() }), { userId: ada.id, ip: ip() })

    expect(message).toMatchObject({ userId: ada.id, orderNumber: ada.order })
    expect((await contact.getContactMessage(message.id))?.orderExists).toBe(true)
  })

  it.each([
    ["someone else's order", () => ben.order],
    ["an unknown order", () => "NC-0"],
  ])("refuses %s from a signed-in sender and stores nothing", async (_label, orderNumber) => {
    const email = sender("foreign")
    await expect(
      contact.createContactMessage(input({ email, orderNumber: orderNumber() }), { userId: ada.id, ip: ip() }),
    ).rejects.toBeInstanceOf(contact.ContactOrderNotFoundError)

    const { rows } = await query("SELECT 1 FROM contact_messages WHERE email = $1", [email])
    expect(rows).toHaveLength(0)
  })

  it("lets a signed-in sender leave the order number out", async () => {
    const message = await contact.createContactMessage(input(), { userId: ben.id, ip: ip() })
    expect(message).toMatchObject({ userId: ben.id, orderNumber: null })
  })
})

describe("rate limit", () => {
  it("allows one message a minute per email address, in any case", async () => {
    const email = sender("limit")
    await contact.createContactMessage(input({ email }), { userId: null, ip: ip() })

    const second = contact.createContactMessage(input({ email: email.toUpperCase() }), { userId: null, ip: ip() })
    await expect(second).rejects.toBeInstanceOf(contact.ContactRateLimitError)
    await expect(second).rejects.toMatchObject({ status: 429, code: "rate_limited" })

    await age(email)
    await expect(contact.createContactMessage(input({ email }), { userId: null, ip: ip() })).resolves.toMatchObject({ email })
  })

  it("allows one message a minute per IP, whatever the email", async () => {
    const address = ip()
    await contact.createContactMessage(input(), { userId: null, ip: address })

    await expect(contact.createContactMessage(input(), { userId: null, ip: address })).rejects.toBeInstanceOf(
      contact.ContactRateLimitError,
    )
  })

  it("allows one message a minute per signed-in account, whatever the email or IP", async () => {
    const userId = ada.id
    await query("UPDATE contact_messages SET created_at = created_at - interval '2 minutes' WHERE user_id = $1", [userId])
    await contact.createContactMessage(input(), { userId, ip: ip() })

    await expect(contact.createContactMessage(input(), { userId, ip: ip() })).rejects.toBeInstanceOf(contact.ContactRateLimitError)
  })

  it("doesn't count a message refused for its order number", async () => {
    const email = sender("refused")
    await expect(
      contact.createContactMessage(input({ email, orderNumber: ben.order }), { userId: ada.id, ip: null }),
    ).rejects.toBeInstanceOf(contact.ContactOrderNotFoundError)
    await query("UPDATE contact_messages SET created_at = created_at - interval '2 minutes' WHERE user_id = $1", [ada.id])

    await expect(contact.createContactMessage(input({ email }), { userId: ada.id, ip: null })).resolves.toMatchObject({ email })
  })

  it("lets only one of two simultaneous messages from one address through", async () => {
    const email = sender("race")
    const results = await Promise.allSettled([
      contact.createContactMessage(input({ email }), { userId: null, ip: ip() }),
      contact.createContactMessage(input({ email }), { userId: null, ip: ip() }),
    ])

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(contact.ContactRateLimitError)
  })
})

describe("admin", () => {
  it("lists, searches and filters messages newest first, with counts per status", async () => {
    const before = await contact.getContactMessageCounts()
    const newBefore = await contact.countNewContactMessages()
    const tag = `admin${run}`
    const first = await contact.createContactMessage(input({ email: sender("admin"), message: `First ${tag} message` }), { userId: null, ip: ip() })
    const second = await contact.createContactMessage(input({ email: sender("admin"), message: `Second ${tag} message` }), { userId: null, ip: ip() })

    expect((await contact.listContactMessages({ q: tag })).items.map((m) => m.id)).toEqual([second.id, first.id])
    expect((await contact.listContactMessages({ q: second.email.toUpperCase() })).items.map((m) => m.id)).toEqual([second.id])

    await contact.setContactMessageStatus(first.id, "archived")
    expect(await contact.getContactMessage(first.id)).toMatchObject({ status: "archived" })
    expect((await contact.listContactMessages({ q: tag, status: "new" })).items.map((m) => m.id)).toEqual([second.id])
    expect((await contact.listContactMessages({ q: tag, status: "archived" })).items.map((m) => m.id)).toEqual([first.id])

    const after = await contact.getContactMessageCounts()
    expect(after.new - before.new).toBe(1)
    expect(after.archived - before.archived).toBe(1)
    expect(await contact.countNewContactMessages()).toBe(newBefore + 1)
    expect((await contact.listNewContactMessages(100)).map((m) => m.id)).toContain(second.id)
    expect((await contact.listNewContactMessages(100)).map((m) => m.id)).not.toContain(first.id)
  })

  it("moves a message between new, read and archived, touching updated_at only on a change", async () => {
    const message = await contact.createContactMessage(input(), { userId: null, ip: ip() })

    const read = await contact.setContactMessageStatus(message.id, "read")
    expect(read.status).toBe("read")
    expect(read.updatedAt.getTime()).toBeGreaterThanOrEqual(message.updatedAt.getTime())
    const again = await contact.setContactMessageStatus(message.id, "read")
    expect(again.updatedAt).toEqual(read.updatedAt)
    expect((await contact.setContactMessageStatus(message.id, "new")).status).toBe("new")
  })

  it("throws NotFoundError for an unknown message and returns null when reading one", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000"
    await expect(contact.setContactMessageStatus(unknown, "read")).rejects.toBeInstanceOf(NotFoundError)
    expect(await contact.getContactMessage(unknown)).toBeNull()
  })

  it("pages the list and treats % and _ in the search literally", async () => {
    const tag = `page${run}`
    for (let i = 0; i < 3; i++) {
      await contact.createContactMessage(input({ message: `Paging ${tag} ${i}` }), { userId: null, ip: ip() })
    }
    const page2 = await contact.listContactMessages({ q: tag, pageSize: 2, page: 2 })
    expect(page2).toMatchObject({ total: 3, pageCount: 2, page: 2 })
    expect(page2.items).toHaveLength(1)
    expect((await contact.listContactMessages({ q: `page${run.slice(0, 3)}%` })).total).toBe(0)
  })
})
