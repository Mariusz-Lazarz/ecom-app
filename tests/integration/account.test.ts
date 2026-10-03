import bcrypt from "bcryptjs"
import { afterAll, describe, expect, it, vi } from "vitest"

// Runs the profile and password functions of the users module against the docker compose
// Postgres, on throwaway accounts created through createUser and deleted afterwards.
vi.mock("server-only", () => ({}))

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const users = await import("@/lib/users")
const { NotFoundError } = await import("@/lib/errors")

const run = Math.random().toString(36).slice(2, 10)
const emails: string[] = []
const PASSWORD = "secret123"

async function makeUser(firstName = "Ada") {
  const email = `account-${run}-${emails.length}@example.com`
  emails.push(email)
  const user = await users.createUser({ firstName, lastName: "Lovelace", email, password: PASSWORD })
  return { id: user.id, email }
}

async function stored(id: string) {
  const { rows } = await query<{ first_name: string; last_name: string; email: string; password_hash: string }>(
    "SELECT first_name, last_name, email, password_hash FROM users WHERE id = $1",
    [id],
  )
  return rows[0]
}

afterAll(async () => {
  // Emails may have changed during the tests, so also match the renamed ones.
  await query("DELETE FROM users WHERE email = ANY($1) OR email LIKE $2", [emails, `%-${run}-%`])
  await getPool().end()
})

describe("updateProfile", () => {
  it("changes the name without a password", async () => {
    const user = await makeUser()

    const saved = await users.updateProfile(user.id, { firstName: "Augusta", lastName: "King", email: user.email })

    expect(saved).toEqual({ firstName: "Augusta", lastName: "King", email: user.email })
    expect(await stored(user.id)).toMatchObject({ first_name: "Augusta", last_name: "King", email: user.email })
  })

  it("treats a case-only email change as no change (no password needed, stored lower-case)", async () => {
    const user = await makeUser()

    const saved = await users.updateProfile(user.id, { firstName: "Ada", lastName: "Lovelace", email: user.email.toUpperCase() })

    expect(saved.email).toBe(user.email)
  })

  it("changes the email with the right current password, stored lower-case", async () => {
    const user = await makeUser()
    const next = `account-${run}-renamed@example.com`

    const saved = await users.updateProfile(user.id, {
      firstName: "Ada",
      lastName: "Lovelace",
      email: next.toUpperCase(),
      currentPassword: PASSWORD,
    })

    expect(saved.email).toBe(next)
    expect((await stored(user.id)).email).toBe(next)
    expect(await users.findUserByEmail(user.email)).toBeNull()
  })

  it.each([
    ["a wrong", "wrong-pass1"],
    ["a missing", undefined],
  ])("refuses an email change with %s current password and changes nothing", async (_case, currentPassword) => {
    const user = await makeUser()

    await expect(
      users.updateProfile(user.id, {
        firstName: "Changed",
        lastName: "Lovelace",
        email: `account-${run}-sneaky@example.com`,
        currentPassword,
      }),
    ).rejects.toThrow(users.IncorrectPasswordError)

    expect(await stored(user.id)).toMatchObject({ first_name: "Ada", email: user.email })
  })

  it("refuses an email another account uses, in any case", async () => {
    const taken = await makeUser("Taken")
    const user = await makeUser()

    await expect(
      users.updateProfile(user.id, {
        firstName: "Ada",
        lastName: "Lovelace",
        email: taken.email.toUpperCase(),
        currentPassword: PASSWORD,
      }),
    ).rejects.toThrow(users.EmailTakenError)

    expect((await stored(user.id)).email).toBe(user.email)
  })

  it("reports a deleted account as not found", async () => {
    await expect(
      users.updateProfile("00000000-0000-4000-8000-000000000000", { firstName: "A", lastName: "B", email: "x@example.com" }),
    ).rejects.toThrow(NotFoundError)
  })
})

describe("changePassword", () => {
  it("verifies the old password and stores a new bcrypt hash", async () => {
    const user = await makeUser()
    const before = (await stored(user.id)).password_hash

    await users.changePassword(user.id, PASSWORD, "new-pass2")

    const after = (await stored(user.id)).password_hash
    expect(after).not.toBe(before)
    expect(after).toMatch(/^\$2[aby]\$12\$/)
    expect(await bcrypt.compare("new-pass2", after)).toBe(true)
    expect(await bcrypt.compare(PASSWORD, after)).toBe(false)
  })

  it("refuses a wrong current password and keeps the old hash", async () => {
    const user = await makeUser()
    const before = (await stored(user.id)).password_hash

    await expect(users.changePassword(user.id, "wrong-pass1", "new-pass2")).rejects.toThrow(users.IncorrectPasswordError)

    expect((await stored(user.id)).password_hash).toBe(before)
  })

  it("reports a deleted account as not found", async () => {
    await expect(users.changePassword("00000000-0000-4000-8000-000000000000", PASSWORD, "new-pass2")).rejects.toThrow(
      NotFoundError,
    )
  })
})
