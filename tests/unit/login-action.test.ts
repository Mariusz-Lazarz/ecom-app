import { beforeEach, describe, expect, it, vi } from "vitest"

const signIn = vi.fn()
const flash = vi.fn()
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
})

vi.mock("@/auth", () => ({ signIn: (...args: unknown[]) => signIn(...args) }))
vi.mock("@/lib/flash", () => ({ flash: (...args: unknown[]) => flash(...args) }))
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }))
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
    flash.mockReset()
    redirect.mockClear()
  })

  it("signs in with a normalized email, queues a welcome toast and redirects home", async () => {
    signIn.mockResolvedValue("http://localhost/")

    await expect(login(undefined, form())).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/;307;" })
    expect(signIn).toHaveBeenCalledExactlyOnceWith("credentials", {
      email: "jan@example.com",
      password: "secret123",
      redirect: false,
    })
    expect(flash).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: "Welcome back!",
      description: "You're signed in.",
    })
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/")
    // The toast has to be queued before the redirect ends the action.
    expect(flash.mock.invocationCallOrder[0]).toBeLessThan(redirect.mock.invocationCallOrder[0])
  })

  it("rethrows unexpected errors without a toast or redirect", async () => {
    const boom = new Error("boom")
    signIn.mockRejectedValue(boom)

    await expect(login(undefined, form())).rejects.toBe(boom)
    expect(flash).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("returns field errors without calling Auth.js", async () => {
    const state = await login(undefined, form({ email: "nope", password: "" }))
    expect(signIn).not.toHaveBeenCalled()
    expect(flash).not.toHaveBeenCalled()
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
    expect(flash).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("shows a generic message on other auth failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    signIn.mockRejectedValue(new AuthError("db down"))
    const state = await login(undefined, form())
    expect(state).toMatchObject({ message: "Something went wrong. Please try again." })
    expect(flash).not.toHaveBeenCalled()
  })
})
