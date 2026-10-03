import pg from "pg"
import { afterAll, describe, expect, it, vi } from "vitest"

import { SEED_ADDRESS_LABEL, upsertHomeAddress } from "../../db/seed/addresses.mjs"

// Runs the saved addresses module against the docker compose Postgres. Every test works on its own
// throwaway users, deleted afterwards along with their addresses (ON DELETE CASCADE).
vi.mock("server-only", () => ({}))

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const addresses = await import("@/lib/addresses")
const { MAX_ADDRESSES } = await import("@/lib/validation/addresses")

const run = Math.random().toString(36).slice(2, 10)
const userIds: string[] = []

async function makeUser() {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO users (first_name, last_name, email, password_hash)
     VALUES ('Addr', 'Test', $1, 'not-a-real-hash') RETURNING id`,
    [`addr-${run}-${userIds.length}@example.com`],
  )
  userIds.push(rows[0].id)
  return rows[0].id
}

const input = (label: string, city = "London") => ({
  label,
  fullName: "Ada Lovelace",
  line1: "12 Analytical Row",
  line2: null,
  city,
  postalCode: "EC1A 1BB",
  country: "GB" as const,
  phone: "+44 20 7946 0958",
})

async function defaults(userId: string) {
  const { rows } = await query<{ label: string }>(
    "SELECT label FROM addresses WHERE user_id = $1 AND is_default ORDER BY label",
    [userId],
  )
  return rows.map((row) => row.label)
}

afterAll(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds])
  await getPool().end()
})

describe("createAddress / listAddresses / getAddress", () => {
  it("lists nothing for a user without addresses", async () => {
    const userId = await makeUser()
    expect(await addresses.listAddresses(userId)).toEqual([])
  })

  it("makes the first address the default and later ones not, listing the default first", async () => {
    const userId = await makeUser()

    const home = await addresses.createAddress(userId, input("Home"))
    const office = await addresses.createAddress(userId, { ...input("Office", "Leeds"), line2: "Floor 2" })

    expect(home).toMatchObject({ ...input("Home"), isDefault: true })
    expect(home.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(home.createdAt).toBeInstanceOf(Date)
    expect(office).toMatchObject({ label: "Office", city: "Leeds", line2: "Floor 2", isDefault: false })
    expect((await addresses.listAddresses(userId)).map((a) => [a.label, a.isDefault])).toEqual([
      ["Home", true],
      ["Office", false],
    ])
    expect(await addresses.getAddress(userId, office.id)).toEqual(office)
  })

  it("makes a new address the default when asked, so there's still only one", async () => {
    const userId = await makeUser()
    await addresses.createAddress(userId, input("Home"))

    await addresses.createAddress(userId, input("Office"), { makeDefault: true })

    expect(await defaults(userId)).toEqual(["Office"])
    expect((await addresses.listAddresses(userId))[0].label).toBe("Office")
  })

  it(`allows ${MAX_ADDRESSES} addresses and refuses one more`, async () => {
    const userId = await makeUser()
    for (let i = 1; i <= MAX_ADDRESSES; i++) await addresses.createAddress(userId, input(`Address ${i}`))

    await expect(addresses.createAddress(userId, input("One too many"))).rejects.toThrow(addresses.AddressLimitError)
    expect(await addresses.listAddresses(userId)).toHaveLength(MAX_ADDRESSES)

    // Deleting one makes room again.
    const [first] = await addresses.listAddresses(userId)
    await addresses.deleteAddress(userId, first.id)
    await expect(addresses.createAddress(userId, input("Fits again"))).resolves.toMatchObject({ label: "Fits again" })
  })

  it("serialises concurrent saves so the limit holds", async () => {
    const userId = await makeUser()
    for (let i = 1; i < MAX_ADDRESSES; i++) await addresses.createAddress(userId, input(`Address ${i}`))

    const results = await Promise.allSettled([
      addresses.createAddress(userId, input("Race A")),
      addresses.createAddress(userId, input("Race B")),
    ])

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason)).toEqual([
      expect.any(addresses.AddressLimitError),
    ])
    expect(await addresses.listAddresses(userId)).toHaveLength(MAX_ADDRESSES)
  })
})

describe("updateAddress", () => {
  it("replaces the fields, keeps the default flag and bumps updated_at", async () => {
    const userId = await makeUser()
    const home = await addresses.createAddress(userId, input("Home"))

    const updated = await addresses.updateAddress(userId, home.id, { ...input("Flat", "Bath"), line2: "Top floor" })

    expect(updated).toMatchObject({ id: home.id, label: "Flat", city: "Bath", line2: "Top floor", isDefault: true })
    expect(updated.createdAt).toEqual(home.createdAt)
    expect(updated.updatedAt.getTime()).toBeGreaterThan(home.updatedAt.getTime())
  })
})

describe("setDefaultAddress", () => {
  it("switches the default, leaving exactly one", async () => {
    const userId = await makeUser()
    await addresses.createAddress(userId, input("Home"))
    const office = await addresses.createAddress(userId, input("Office"))
    const cabin = await addresses.createAddress(userId, input("Cabin"))

    await addresses.setDefaultAddress(userId, office.id)
    expect(await defaults(userId)).toEqual(["Office"])

    await addresses.setDefaultAddress(userId, cabin.id)
    expect(await defaults(userId)).toEqual(["Cabin"])

    // Setting the current default again changes nothing.
    await addresses.setDefaultAddress(userId, cabin.id)
    expect(await defaults(userId)).toEqual(["Cabin"])
  })

  it("never lets the database hold two defaults for one user", async () => {
    const userId = await makeUser()
    const home = await addresses.createAddress(userId, input("Home"))
    const office = await addresses.createAddress(userId, input("Office"))

    await expect(query("UPDATE addresses SET is_default = true WHERE id = $1", [office.id])).rejects.toMatchObject({
      code: "23505",
    })
    expect((await addresses.getAddress(userId, home.id))?.isDefault).toBe(true)
  })
})

describe("deleteAddress", () => {
  it("promotes the oldest remaining address when the default goes", async () => {
    const userId = await makeUser()
    const home = await addresses.createAddress(userId, input("Home"))
    await addresses.createAddress(userId, input("Office"))
    await addresses.createAddress(userId, input("Cabin"))

    await addresses.deleteAddress(userId, home.id)

    expect(await defaults(userId)).toEqual(["Office"])
    expect(await addresses.getAddress(userId, home.id)).toBeNull()
  })

  it("leaves the default alone when another address goes, and handles deleting the last one", async () => {
    const userId = await makeUser()
    const home = await addresses.createAddress(userId, input("Home"))
    const office = await addresses.createAddress(userId, input("Office"))

    await addresses.deleteAddress(userId, office.id)
    expect(await defaults(userId)).toEqual(["Home"])

    await addresses.deleteAddress(userId, home.id)
    expect(await addresses.listAddresses(userId)).toEqual([])
  })

  it("refuses an address that no longer exists", async () => {
    const userId = await makeUser()
    const home = await addresses.createAddress(userId, input("Home"))
    await addresses.deleteAddress(userId, home.id)

    await expect(addresses.deleteAddress(userId, home.id)).rejects.toThrow(addresses.AddressNotFoundError)
  })
})

describe("user isolation", () => {
  it("treats another user's address as not found everywhere and leaves it untouched", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const home = await addresses.createAddress(owner, input("Home"))
    await addresses.createAddress(other, input("Mine"))

    expect(await addresses.getAddress(other, home.id)).toBeNull()
    expect((await addresses.listAddresses(other)).map((a) => a.label)).toEqual(["Mine"])
    await expect(addresses.updateAddress(other, home.id, input("Hijacked"))).rejects.toThrow(addresses.AddressNotFoundError)
    await expect(addresses.setDefaultAddress(other, home.id)).rejects.toThrow(addresses.AddressNotFoundError)
    await expect(addresses.deleteAddress(other, home.id)).rejects.toThrow(addresses.AddressNotFoundError)

    expect(await addresses.getAddress(owner, home.id)).toEqual(home)
    expect(await defaults(other)).toEqual(["Mine"])
  })

  it("counts the limit per user", async () => {
    const full = await makeUser()
    const other = await makeUser()
    for (let i = 1; i <= MAX_ADDRESSES; i++) await addresses.createAddress(full, input(`Address ${i}`))

    await expect(addresses.createAddress(other, input("Home"))).resolves.toMatchObject({ isDefault: true })
  })
})

describe("cascade", () => {
  it("deletes a user's addresses with the user", async () => {
    const userId = await makeUser()
    await addresses.createAddress(userId, input("Home"))
    await addresses.createAddress(userId, input("Office"))

    await query("DELETE FROM users WHERE id = $1", [userId])

    const { rows } = await query<{ n: number }>("SELECT count(*)::int AS n FROM addresses WHERE user_id = $1", [userId])
    expect(rows[0].n).toBe(0)
  })
})

describe("seed upsertHomeAddress", () => {
  it("adds one default Home address, updates it on re-run instead of duplicating, and takes the default back", async () => {
    const userId = await makeUser()
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      const office = await addresses.createAddress(userId, input("Office"))
      const address = { line1: "ul. Floriańska 15", line2: "m. 3", city: "Kraków", postalCode: "31-019", country: "PL", phone: "+48 600 100 200" }

      const first = await upsertHomeAddress(client, userId, "Addr Test", address)
      const again = await upsertHomeAddress(client, userId, "Addr Test", { ...address, phone: "+48 600 100 201" })

      expect(again).toBe(first)
      const list = await addresses.listAddresses(userId)
      expect(list.map((a) => [a.label, a.isDefault])).toEqual([
        [SEED_ADDRESS_LABEL, true],
        ["Office", false],
      ])
      expect(list[0]).toMatchObject({ fullName: "Addr Test", city: "Kraków", phone: "+48 600 100 201" })
      expect((await addresses.getAddress(userId, office.id))?.isDefault).toBe(false)
    } finally {
      await client.end()
    }
  })
})
