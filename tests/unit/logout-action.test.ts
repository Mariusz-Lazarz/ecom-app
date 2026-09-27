import { describe, expect, it, vi } from "vitest"

const signOut = vi.fn()

vi.mock("@/auth", () => ({ signOut: (...args: unknown[]) => signOut(...args) }))

const { logout } = await import("@/app/actions/logout")

describe("logout action", () => {
  it("signs out and sends the user to the home page", async () => {
    await logout()

    expect(signOut).toHaveBeenCalledExactlyOnceWith({ redirectTo: "/" })
  })
})
