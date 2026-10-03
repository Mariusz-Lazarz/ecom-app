import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ current: null as null | { user: { id?: string } } }))
const users = vi.hoisted(() => {
  class EmailTakenError extends Error {}
  class IncorrectPasswordError extends Error {
    constructor() {
      super("Your current password is incorrect.")
    }
  }
  return { updateProfile: vi.fn(), changePassword: vi.fn(), EmailTakenError, IncorrectPasswordError }
})
const updateSession = vi.fn()
const flash = vi.fn()
const refresh = vi.fn()
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
})

vi.mock("@/auth", () => ({ auth: async () => session.current, updateSession: (...args: unknown[]) => updateSession(...args) }))
vi.mock("@/lib/users", () => users)
vi.mock("@/lib/flash", () => ({ flash: (...args: unknown[]) => flash(...args) }))
vi.mock("next/cache", () => ({ refresh: () => refresh() }))
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }))

const { updateProfile, changePassword } = await import("@/app/actions/account")

const USER_ID = "8d3c1f7a-1b2c-4d5e-8f90-a1b2c3d4e5f6"
const asUser = () => (session.current = { user: { id: USER_ID } })

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const profile = { firstName: " Ada ", lastName: "Lovelace", email: "Ada@Example.com", currentPassword: "old-pass1" }
const typed = { firstName: " Ada ", lastName: "Lovelace", email: "Ada@Example.com" }

beforeEach(() => {
  session.current = null
  users.updateProfile.mockReset()
  users.changePassword.mockReset()
  updateSession.mockReset()
  flash.mockReset()
  refresh.mockReset()
  redirect.mockClear()
})

describe("updateProfile action", () => {
  it("sends signed-out visitors to /login without saving", async () => {
    await expect(updateProfile(undefined, form(profile))).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/login;307;",
    })
    expect(users.updateProfile).not.toHaveBeenCalled()
  })

  it("saves the session user's normalised details, updates the session and queues a toast", async () => {
    asUser()
    users.updateProfile.mockResolvedValue({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" })

    const state = await updateProfile(undefined, form({ ...profile, userId: "someone-else" }))

    expect(users.updateProfile).toHaveBeenCalledExactlyOnceWith(USER_ID, {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      currentPassword: "old-pass1",
    })
    expect(updateSession).toHaveBeenCalledExactlyOnceWith({ user: { name: "Ada Lovelace", email: "ada@example.com" } })
    expect(flash).toHaveBeenCalledExactlyOnceWith({ type: "success", title: "Profile updated" })
    expect(refresh).toHaveBeenCalledOnce()
    expect(state).toEqual({ success: true, values: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" } })
  })

  it("returns field errors with the typed values, never the password", async () => {
    asUser()

    const state = await updateProfile(undefined, form({ ...profile, firstName: "  ", email: "not-an-email" }))

    expect(state).toEqual({
      errors: { firstName: ["First name is required."], email: ["Please enter a valid email."] },
      values: { ...typed, firstName: "  ", email: "not-an-email" },
    })
    expect(JSON.stringify(state)).not.toContain("old-pass1")
    expect(users.updateProfile).not.toHaveBeenCalled()
    expect(updateSession).not.toHaveBeenCalled()
  })

  it("maps a taken email to an email field error", async () => {
    asUser()
    users.updateProfile.mockRejectedValue(new users.EmailTakenError())

    const state = await updateProfile(undefined, form(profile))

    expect(state).toEqual({ errors: { email: ["An account with this email already exists."] }, values: typed })
    expect(updateSession).not.toHaveBeenCalled()
    expect(flash).not.toHaveBeenCalled()
  })

  it("maps a wrong or missing current password to a password field error", async () => {
    asUser()
    users.updateProfile.mockRejectedValue(new users.IncorrectPasswordError())

    const state = await updateProfile(undefined, form(profile))

    expect(state).toEqual({ errors: { currentPassword: ["Your current password is incorrect."] }, values: typed })
    expect(JSON.stringify(state)).not.toContain("old-pass1")
    expect(updateSession).not.toHaveBeenCalled()
  })

  it("hides unexpected errors behind a generic message", async () => {
    asUser()
    users.updateProfile.mockRejectedValue(new Error("connection reset: secret details"))

    const state = await updateProfile(undefined, form(profile))

    expect(state).toEqual({ message: "Something went wrong. Please try again.", values: typed })
  })
})

describe("changePassword action", () => {
  const change = { currentPassword: "old-pass1", newPassword: "new-pass2", confirmPassword: "new-pass2" }

  it("sends signed-out visitors to /login without changing anything", async () => {
    await expect(changePassword(undefined, form(change))).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/login;307;",
    })
    expect(users.changePassword).not.toHaveBeenCalled()
  })

  it("changes the session user's password, keeps the session and queues a toast", async () => {
    asUser()
    users.changePassword.mockResolvedValue(undefined)

    const state = await changePassword(undefined, form(change))

    expect(state).toEqual({ success: true })
    expect(users.changePassword).toHaveBeenCalledExactlyOnceWith(USER_ID, "old-pass1", "new-pass2")
    expect(flash).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: "Password changed",
      description: "Use your new password next time you sign in.",
    })
    expect(updateSession).not.toHaveBeenCalled()
  })

  it.each([
    [
      "a weak new password",
      { newPassword: "short", confirmPassword: "short" },
      {
        newPassword: [
          "Be at least 8 characters long.",
          "Contain at least one number.",
        ],
      },
    ],
    ["a mismatched confirmation", { confirmPassword: "new-pass3" }, { confirmPassword: ["Passwords don't match."] }],
    [
      "the same password again",
      { newPassword: "old-pass1", confirmPassword: "old-pass1" },
      { newPassword: ["Choose a password different from your current one."] },
    ],
    ["a missing current password", { currentPassword: "" }, { currentPassword: ["Enter your current password."] }],
  ])("rejects %s with field errors and no passwords", async (_case, overrides, errors) => {
    asUser()

    const state = await changePassword(undefined, form({ ...change, ...overrides }))

    expect(state).toEqual({ errors })
    expect(users.changePassword).not.toHaveBeenCalled()
  })

  it("maps a wrong current password to its field", async () => {
    asUser()
    users.changePassword.mockRejectedValue(new users.IncorrectPasswordError())

    const state = await changePassword(undefined, form(change))

    expect(state).toEqual({ errors: { currentPassword: ["Your current password is incorrect."] } })
    expect(flash).not.toHaveBeenCalled()
  })

  it("hides unexpected errors behind a generic message", async () => {
    asUser()
    users.changePassword.mockRejectedValue(new Error("db down"))

    expect(await changePassword(undefined, form(change))).toEqual({ message: "Something went wrong. Please try again." })
  })
})
