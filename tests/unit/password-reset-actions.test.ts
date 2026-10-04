import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const domain = vi.hoisted(() => {
  class InvalidResetTokenError extends Error {
    constructor() {
      super("This password reset link is invalid or has expired.")
    }
  }
  return {
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    InvalidResetTokenError,
    RESET_TOKEN_TTL_MINUTES: 60,
  }
})
const queued = vi.hoisted(() => [] as { scope: string; build: () => unknown }[])
const flash = vi.fn()
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
})

vi.mock("@/lib/password-reset", () => domain)
vi.mock("@/lib/mail", () => ({
  sendMailLater: (scope: string, build: () => unknown) => void queued.push({ scope, build }),
}))
vi.mock("@/lib/flash", () => ({ flash: (...args: unknown[]) => flash(...args) }))
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }))

const { requestPasswordReset, resetPassword } = await import("@/app/actions/password-reset")

const TOKEN = "Xf3k9_-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

beforeEach(() => {
  domain.requestPasswordReset.mockReset()
  domain.resetPassword.mockReset()
  queued.length = 0
  flash.mockReset()
  redirect.mockClear()
  vi.stubEnv("APP_URL", "https://shop.example")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("requestPasswordReset action", () => {
  it("rejects an invalid email inline without touching the database", async () => {
    const state = await requestPasswordReset(undefined, form({ email: "not-an-email" }))

    expect(state).toEqual({ errors: { email: ["Please enter a valid email."] }, values: { email: "not-an-email" } })
    expect(domain.requestPasswordReset).not.toHaveBeenCalled()
  })

  it("answers the same for an unknown email, a throttled request and a sent link", async () => {
    const answers = []
    for (const result of [{ status: "unknown-email" }, { status: "throttled" }]) {
      domain.requestPasswordReset.mockResolvedValueOnce(result)
      answers.push(await requestPasswordReset(undefined, form({ email: " Ada@Example.com " })))
    }
    domain.requestPasswordReset.mockResolvedValueOnce({
      status: "created",
      token: TOKEN,
      user: { id: "u1", email: "ada@example.com", firstName: "Ada" },
      expiresAt: new Date(),
    })
    answers.push(await requestPasswordReset(undefined, form({ email: " Ada@Example.com " })))

    expect(answers).toEqual(Array(3).fill({ success: true, values: { email: "ada@example.com" } }))
    expect(domain.requestPasswordReset).toHaveBeenCalledWith("ada@example.com")
    // Only the created token is emailed.
    expect(queued).toHaveLength(1)
  })

  it("emails the account an absolute reset link carrying the raw token", async () => {
    domain.requestPasswordReset.mockResolvedValue({
      status: "created",
      token: TOKEN,
      user: { id: "u1", email: "ada@example.com", firstName: "Ada" },
      expiresAt: new Date(),
    })

    await requestPasswordReset(undefined, form({ email: "ada@example.com" }))

    expect(queued[0].scope).toBe("password-reset")
    const mail = queued[0].build() as { to: string; subject: string; text: string }
    expect(mail.to).toBe("ada@example.com")
    expect(mail.subject).toBe("Reset your Northcart password")
    expect(mail.text).toContain(`https://shop.example/reset-password?token=${TOKEN}`)
    expect(mail.text).toContain("Hi Ada,")
    expect(mail.text).toContain("expires in 1 hour")
  })

  it("reports an unexpected failure with a generic message and sends nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    domain.requestPasswordReset.mockRejectedValue(new Error("db down"))

    const state = await requestPasswordReset(undefined, form({ email: "ada@example.com" }))

    expect(state).toEqual({ message: "Something went wrong. Please try again.", values: { email: "ada@example.com" } })
    expect(queued).toHaveLength(0)
  })
})

describe("resetPassword action", () => {
  const valid = { token: TOKEN, password: "newpass123", confirmPassword: "newpass123" }

  it("sets the new password, queues a toast and redirects to /login", async () => {
    domain.resetPassword.mockResolvedValue({ id: "u1", email: "ada@example.com" })

    await expect(resetPassword(undefined, form(valid))).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/login;307;" })

    expect(domain.resetPassword).toHaveBeenCalledWith(TOKEN, "newpass123")
    expect(flash).toHaveBeenCalledWith({ type: "success", title: "Password updated", description: "Sign in with your new password." })
  })

  it("applies registration's password rules", async () => {
    const state = await resetPassword(undefined, form({ ...valid, password: "short", confirmPassword: "short" }))

    expect(state).toEqual({
      errors: { password: ["Be at least 8 characters long.", "Contain at least one number."] },
    })
    expect(domain.resetPassword).not.toHaveBeenCalled()
    expect(JSON.stringify(state)).not.toContain("short")
  })

  it("rejects a password over 72 characters", async () => {
    const long = `a1${"x".repeat(71)}`
    const state = await resetPassword(undefined, form({ ...valid, password: long, confirmPassword: long }))
    expect(state).toEqual({ errors: { password: ["Be at most 72 characters long."] } })
  })

  it("requires the confirmation to match, without echoing either password", async () => {
    const state = await resetPassword(undefined, form({ ...valid, confirmPassword: "different123" }))

    expect(state).toEqual({ errors: { confirmPassword: ["Passwords don't match."] } })
    expect(JSON.stringify(state)).not.toContain("newpass123")
    expect(domain.resetPassword).not.toHaveBeenCalled()
  })

  it.each([["missing", ""], ["malformed", "abc"], ["too long", `${TOKEN}x`]])(
    "treats a %s token as invalid without calling the domain",
    async (_case, token) => {
      const state = await resetPassword(undefined, form({ ...valid, token }))

      expect(state).toEqual({ invalidToken: true, message: "This password reset link is invalid or has expired." })
      expect(domain.resetPassword).not.toHaveBeenCalled()
    },
  )

  it("reports an expired, used or unknown token as invalid", async () => {
    domain.resetPassword.mockRejectedValue(new domain.InvalidResetTokenError())

    const state = await resetPassword(undefined, form(valid))

    expect(state).toEqual({ invalidToken: true, message: "This password reset link is invalid or has expired." })
    expect(flash).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("reports unexpected failures with a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    domain.resetPassword.mockRejectedValue(new Error("db down"))

    expect(await resetPassword(undefined, form(valid))).toEqual({ message: "Something went wrong. Please try again." })
  })
})
