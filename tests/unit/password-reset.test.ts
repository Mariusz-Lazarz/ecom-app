import { createHash } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

// The token handling of src/lib/password-reset.ts with a fake database client: what's stored and
// what's looked up. The rules that need real SQL (expiry, single use, throttling) are covered in
// tests/integration/password-reset.test.ts.
vi.mock("server-only", () => ({}))

const client = vi.hoisted(() => ({ query: vi.fn() }))
const db = vi.hoisted(() => ({
  query: vi.fn(),
  withTransaction: vi.fn(async (fn: (c: typeof client) => unknown) => fn(client)),
}))
vi.mock("@/lib/db", () => db)
vi.mock("@/lib/users", () => ({ hashPassword: async (password: string) => `hashed:${password}` }))

const reset = await import("@/lib/password-reset")

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

beforeEach(() => {
  client.query.mockReset()
  db.query.mockReset()
})

describe("tokens", () => {
  it("are 32 random bytes in base64url, different every time", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => reset.generateResetToken()))
    expect(tokens.size).toBe(20)
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(Buffer.from(token, "base64url")).toHaveLength(32)
    }
  })

  it("are hashed with SHA-256 as hex", () => {
    expect(reset.hashResetToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
})

describe("requestPasswordReset", () => {
  const user = { id: "u1", email: "ada@example.com", first_name: "Ada" }

  it("stores only the token's hash and returns the raw token for the link", async () => {
    const expiresAt = new Date("2026-10-03T13:00:00Z")
    client.query
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [{ active: 0, recent: 0 }] })
      .mockResolvedValueOnce({ rows: [{ expires_at: expiresAt }] })

    const result = await reset.requestPasswordReset(" Ada@Example.com ")

    expect(result).toEqual({
      status: "created",
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      user: { id: "u1", email: "ada@example.com", firstName: "Ada" },
      expiresAt,
    })
    const token = (result as { token: string }).token
    expect(client.query.mock.calls[0][1]).toEqual(["Ada@Example.com"])
    const [sql, params] = client.query.mock.calls[2]
    expect(sql).toContain("INSERT INTO password_reset_tokens")
    expect(params).toEqual(["u1", sha256(token), 60])
    expect(JSON.stringify(client.query.mock.calls)).not.toContain(token)
  })

  it("creates nothing for an unknown email", async () => {
    client.query.mockResolvedValueOnce({ rows: [] })

    expect(await reset.requestPasswordReset("nobody@example.com")).toEqual({ status: "unknown-email" })
    expect(client.query).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["a token was created in the last minute", { active: 1, recent: 1 }],
    ["three tokens are still valid", { active: 3, recent: 0 }],
  ])("is throttled when %s", async (_case, counts) => {
    client.query.mockResolvedValueOnce({ rows: [user] }).mockResolvedValueOnce({ rows: [counts] })

    expect(await reset.requestPasswordReset("ada@example.com")).toEqual({ status: "throttled" })
    expect(client.query).toHaveBeenCalledTimes(2)
  })

  it("still allows a request with two valid tokens and none recent", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [{ active: 2, recent: 0 }] })
      .mockResolvedValueOnce({ rows: [{ expires_at: new Date() }] })

    expect((await reset.requestPasswordReset("ada@example.com")).status).toBe("created")
  })
})

describe("isResetTokenValid", () => {
  it("looks the token up by its hash", async () => {
    db.query.mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce({ rows: [] })

    expect(await reset.isResetTokenValid("tok")).toBe(true)
    expect(await reset.isResetTokenValid("tok")).toBe(false)
    expect(db.query.mock.calls[0][1]).toEqual([sha256("tok")])
  })
})

describe("resetPassword", () => {
  it("looks the token up by hash and saves the new password's hash", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "t1", user_id: "u1", valid: true }] })
      .mockResolvedValueOnce({ rows: [{ id: "u1", email: "ada@example.com" }] })
      .mockResolvedValue({ rows: [] })

    expect(await reset.resetPassword("tok", "newpass123")).toEqual({ id: "u1", email: "ada@example.com" })
    expect(client.query.mock.calls[0][1]).toEqual([sha256("tok")])
    expect(client.query.mock.calls[1][1]).toEqual(["u1", "hashed:newpass123"])
    expect(client.query.mock.calls[2][1]).toEqual(["t1"])
    expect(client.query.mock.calls[3]).toEqual([expect.stringContaining("DELETE FROM password_reset_tokens"), ["u1", "t1"]])
  })

  it.each([
    ["unknown", []],
    ["expired or used", [{ id: "t1", user_id: "u1", valid: false }]],
  ])("throws InvalidResetTokenError for an %s token and changes nothing", async (_case, rows) => {
    client.query.mockResolvedValueOnce({ rows })

    await expect(reset.resetPassword("tok", "newpass123")).rejects.toBeInstanceOf(reset.InvalidResetTokenError)
    expect(client.query).toHaveBeenCalledTimes(1)
  })
})
