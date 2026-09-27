import { beforeEach, describe, expect, it, vi } from "vitest"

const signIn = vi.fn()

vi.mock("@/auth", () => ({ signIn: (...args: unknown[]) => signIn(...args) }))
vi.mock("next-auth", () => {
  class AuthError extends Error {
    type = "AuthError"
  }
  class CredentialsSignin extends AuthError {
    type = "CredentialsSignin"
  }
  return { AuthError, CredentialsSignin }
})

const { login } = await import("@/app/actions/login")
const { AuthError, CredentialsSignin } = await import("next-auth")

function form(overrides: Record<string, string> = {}) {
  const data = new FormData()
  const fields = { email: "Jan@Example.com", password: "secret123", ...overrides }
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

describe("login action", () => {
  beforeEach(() => {
    signIn.mockReset()
  })

  it("signs in with a normalized email and redirects home", async () => {
    // Auth.js signals success by throwing Next's redirect, which the action must let through.
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/;307;" })
    signIn.mockRejectedValue(redirect)

    await expect(login(undefined, form())).rejects.toBe(redirect)
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "jan@example.com",
      password: "secret123",
      redirectTo: "/",
    })
  })

  it("returns field errors without calling Auth.js", async () => {
    const state = await login(undefined, form({ email: "nope", password: "" }))
    expect(signIn).not.toHaveBeenCalled()
    expect(state).toMatchObject({
      errors: { email: ["Please enter a valid email."], password: ["Password is required."] },
      values: { email: "nope" },
    })
  })

  it("reports wrong credentials without echoing the password", async () => {
    signIn.mockRejectedValue(new CredentialsSignin())
    const state = await login(undefined, form({ password: "wrong-pass1" }))
    expect(state).toEqual({ message: "Invalid email or password.", values: { email: "Jan@Example.com" } })
    expect(JSON.stringify(state)).not.toContain("wrong-pass1")
  })

  it("shows a generic message on other auth failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    signIn.mockRejectedValue(new AuthError("db down"))
    const state = await login(undefined, form())
    expect(state).toMatchObject({ message: "Something went wrong. Please try again." })
  })
})
