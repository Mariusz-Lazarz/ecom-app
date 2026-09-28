import { describe, expect, it, vi } from "vitest"

const signOut = vi.fn()
const flash = vi.fn()

vi.mock("@/auth", () => ({ signOut: (...args: unknown[]) => signOut(...args) }))
vi.mock("@/lib/flash", () => ({ flash: (...args: unknown[]) => flash(...args) }))

const { logout } = await import("@/app/actions/logout")

describe("logout action", () => {
  it("queues a signed-out toast, then signs out and sends the user to the home page", async () => {
    await logout()

    expect(flash).toHaveBeenCalledExactlyOnceWith({ type: "success", title: "You've been signed out." })
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ redirectTo: "/" })
    // signOut ends the action with a redirect, so the toast must be queued first.
    expect(flash.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0])
  })
})
