import { beforeEach, describe, expect, it, vi } from "vitest"

const createUser = vi.fn()

vi.mock("@/lib/users", () => {
  class EmailTakenError extends Error {}
  return { createUser: (...args: unknown[]) => createUser(...args), EmailTakenError }
})

const { register } = await import("@/app/actions/register")
const { EmailTakenError } = await import("@/lib/users")

function form(overrides: Record<string, string> = {}) {
  const data = new FormData()
  const fields = {
    firstName: "Jan",
    lastName: "Kowalski",
    email: "Jan@Example.com",
    password: "secret123",
    confirmPassword: "secret123",
    ...overrides,
  }
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

describe("register action", () => {
  beforeEach(() => {
    createUser.mockReset()
  })

  it("creates the user with a normalized email", async () => {
    createUser.mockResolvedValue({ id: "1", email: "jan@example.com" })
    const state = await register(undefined, form())
    expect(state).toEqual({ success: true, firstName: "Jan" })
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "jan@example.com" }))
  })

  it("returns field errors without touching the database and never echoes passwords", async () => {
    const state = await register(undefined, form({ password: "short" }))
    expect(createUser).not.toHaveBeenCalled()
    expect(state).toMatchObject({ errors: { password: expect.any(Array) } })
    expect(JSON.stringify(state)).not.toContain("short")
  })

  it("reports an already registered email", async () => {
    createUser.mockRejectedValue(new EmailTakenError())
    const state = await register(undefined, form())
    expect(state).toMatchObject({ errors: { email: ["An account with this email already exists."] } })
  })

  it("shows a generic message on unexpected failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    createUser.mockRejectedValue(new Error("db down"))
    const state = await register(undefined, form())
    expect(state).toMatchObject({ message: "Something went wrong. Please try again." })
  })
})
