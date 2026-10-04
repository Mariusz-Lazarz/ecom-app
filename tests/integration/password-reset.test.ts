import { createHash } from "node:crypto"

import { afterAll, describe, expect, it, vi } from "vitest"

// Runs the password reset tokens against the docker compose Postgres, on throwaway accounts that
// are deleted afterwards (their tokens go with them).
vi.mock("server-only", () => ({}))

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const users = await import("@/lib/users")
const reset = await import("@/lib/password-reset")

const run = Math.random().toString(36).slice(2, 10)
const ids: string[] = []
const PASSWORD = "secret123"
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

async function makeUser() {
  const email = `reset-${run}-${ids.length}@example.com`
  const user = await users.createUser({ firstName: "Ada", lastName: "Lovelace", email, password: PASSWORD })
  ids.push(user.id)
  return { id: user.id, email }
}

type TokenRow = { id: string; token_hash: string; expires_at: Date; used_at: Date | null; created_at: Date }
async function tokensOf(userId: string) {
  const { rows } = await query<TokenRow>(
    "SELECT id, token_hash, expires_at, used_at, created_at FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at",
    [userId],
  )
  return rows
}

/** Moves the user's tokens' creation back, out of the request cooldown. */
const age = (userId: string) =>
  query("UPDATE password_reset_tokens SET created_at = created_at - interval '2 minutes' WHERE user_id = $1", [userId])

async function created(email: string) {
  const result = await reset.requestPasswordReset(email)
  if (result.status !== "created") throw new Error(`Expected a token, got ${result.status}`)
  return result
}

async function passwordWorks(userId: string, password: string) {
  const user = await users.findUserById(userId)
  return users.verifyPassword(password, user!.password_hash)
}

afterAll(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [ids])
  await getPool().end()
})

describe("requestPasswordReset", () => {
  it("stores the token's SHA-256, never the token, valid for an hour", async () => {
    const user = await makeUser()

    const result = await created(user.email.toUpperCase())

    expect(result.user).toEqual({ id: user.id, email: user.email, firstName: "Ada" })
    const [row, ...rest] = await tokensOf(user.id)
    expect(rest).toHaveLength(0)
    expect(row.token_hash).toBe(sha256(result.token))
    expect(row.token_hash).not.toContain(result.token)
    expect(row.used_at).toBeNull()
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(60 * 60 * 1000)
    expect(result.expiresAt).toEqual(row.expires_at)
  })

  it("creates nothing for an unknown email", async () => {
    const { rows: before } = await query<{ n: number }>("SELECT count(*)::int AS n FROM password_reset_tokens")
    expect(await reset.requestPasswordReset(`nobody-${run}@example.com`)).toEqual({ status: "unknown-email" })
    const { rows: after } = await query<{ n: number }>("SELECT count(*)::int AS n FROM password_reset_tokens")
    expect(after[0].n).toBe(before[0].n)
  })

  it("ignores a request within a minute of the last one", async () => {
    const user = await makeUser()
    await created(user.email)

    expect(await reset.requestPasswordReset(user.email)).toEqual({ status: "throttled" })
    expect(await tokensOf(user.id)).toHaveLength(1)

    await age(user.id)
    await created(user.email)
    expect(await tokensOf(user.id)).toHaveLength(2)
  })

  it("allows at most three valid tokens at once; expired and used ones don't count", async () => {
    const user = await makeUser()
    for (let i = 0; i < 3; i++) {
      await created(user.email)
      await age(user.id)
    }
    expect(await reset.requestPasswordReset(user.email)).toEqual({ status: "throttled" })

    const [oldest] = await tokensOf(user.id)
    await query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 second' WHERE id = $1", [oldest.id])
    await created(user.email)
    expect(await tokensOf(user.id)).toHaveLength(4)
  })

  it("throttles concurrent requests to one token", async () => {
    const user = await makeUser()
    const results = await Promise.all(Array.from({ length: 4 }, () => reset.requestPasswordReset(user.email)))
    expect(results.map((r) => r.status).sort()).toEqual(["created", "throttled", "throttled", "throttled"])
    expect(await tokensOf(user.id)).toHaveLength(1)
  })
})

describe("isResetTokenValid", () => {
  it("accepts a fresh token and refuses unknown, expired and used ones", async () => {
    const user = await makeUser()
    const { token } = await created(user.email)

    expect(await reset.isResetTokenValid(token)).toBe(true)
    expect(await reset.isResetTokenValid(reset.generateResetToken())).toBe(false)
    // The hash itself isn't a token.
    expect(await reset.isResetTokenValid(sha256(token))).toBe(false)

    await query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1", [user.id])
    expect(await reset.isResetTokenValid(token)).toBe(false)

    await query("UPDATE password_reset_tokens SET expires_at = now() + interval '1 hour', used_at = now() WHERE user_id = $1", [user.id])
    expect(await reset.isResetTokenValid(token)).toBe(false)
  })
})

describe("resetPassword", () => {
  it("sets the new password, marks the token used and deletes the user's other tokens", async () => {
    const user = await makeUser()
    const other = await makeUser()
    const first = await created(user.email)
    await age(user.id)
    const second = await created(user.email)
    const otherUsers = await created(other.email)

    expect(await reset.resetPassword(second.token, "newpass123")).toEqual({ id: user.id, email: user.email })

    expect(await passwordWorks(user.id, "newpass123")).toBe(true)
    expect(await passwordWorks(user.id, PASSWORD)).toBe(false)
    const rows = await tokensOf(user.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].token_hash).toBe(sha256(second.token))
    expect(rows[0].used_at).toBeInstanceOf(Date)
    await expect(reset.resetPassword(first.token, "another123")).rejects.toBeInstanceOf(reset.InvalidResetTokenError)
    // Someone else's tokens are left alone.
    expect(await reset.isResetTokenValid(otherUsers.token)).toBe(true)
  })

  it("works only once", async () => {
    const user = await makeUser()
    const { token } = await created(user.email)
    await reset.resetPassword(token, "newpass123")

    await expect(reset.resetPassword(token, "another123")).rejects.toBeInstanceOf(reset.InvalidResetTokenError)
    expect(await passwordWorks(user.id, "newpass123")).toBe(true)
  })

  it("refuses an expired token and leaves the password alone", async () => {
    const user = await makeUser()
    const { token } = await created(user.email)
    await query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1", [user.id])

    await expect(reset.resetPassword(token, "newpass123")).rejects.toBeInstanceOf(reset.InvalidResetTokenError)
    expect(await passwordWorks(user.id, PASSWORD)).toBe(true)
    expect((await tokensOf(user.id))[0].used_at).toBeNull()
  })

  it("refuses an unknown token", async () => {
    await expect(reset.resetPassword(reset.generateResetToken(), "newpass123")).rejects.toBeInstanceOf(
      reset.InvalidResetTokenError,
    )
  })

  it("lets only one of two concurrent uses of a token through", async () => {
    const user = await makeUser()
    const { token } = await created(user.email)

    const results = await Promise.allSettled([reset.resetPassword(token, "first1234"), reset.resetPassword(token, "second1234")])

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toBeInstanceOf(reset.InvalidResetTokenError)
  })
})

describe("password_reset_tokens", () => {
  it("are deleted with their user", async () => {
    const { id, email } = await makeUser()
    await created(email)

    await query("DELETE FROM users WHERE id = $1", [id])

    expect(await tokensOf(id)).toHaveLength(0)
  })
})
