import bcrypt from "bcryptjs"
import pg from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { upsertAdmin } from "../../db/seed/admin.mjs"

// Runs the admin seed upsert against the docker compose Postgres with a throwaway email, so the
// real admin account created by `npm run db:seed` is never touched.
if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
const email = `seed-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
const admin = { email, firstName: "Seed", lastName: "Test" }

async function row() {
  const { rows } = await client.query("SELECT id, first_name, role, password_hash FROM users WHERE lower(email) = $1", [
    email,
  ])
  return rows
}

beforeAll(async () => {
  await client.connect()
})

afterAll(async () => {
  await client.query("DELETE FROM users WHERE lower(email) = $1", [email])
  await client.end()
})

describe("admin seed upsert", () => {
  it("creates the account as an admin with a bcrypt hash of the password", async () => {
    const created = await upsertAdmin(client, { ...admin, password: "first-pass1" })

    expect(created).toMatchObject({ email, role: "admin" })
    const rows = await row()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: created.id, first_name: "Seed", role: "admin" })
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$12\$/)
    expect(await bcrypt.compare("first-pass1", rows[0].password_hash)).toBe(true)
  })

  it("updates the same row on re-run, resetting the password and promoting a demoted account", async () => {
    const [before] = await row()
    await client.query("UPDATE users SET role = 'user' WHERE id = $1", [before.id])

    const again = await upsertAdmin(client, { ...admin, email: email.toUpperCase(), password: "second-pass2" })

    expect(again).toMatchObject({ id: before.id, role: "admin" })
    const rows = await row()
    expect(rows).toHaveLength(1)
    expect(rows[0].role).toBe("admin")
    expect(await bcrypt.compare("second-pass2", rows[0].password_hash)).toBe(true)
    expect(await bcrypt.compare("first-pass1", rows[0].password_hash)).toBe(false)
  })

  it("rejects roles outside the CHECK constraint", async () => {
    const [current] = await row()

    await expect(client.query("UPDATE users SET role = 'owner' WHERE id = $1", [current.id])).rejects.toMatchObject({
      code: "23514",
    })
  })
})
