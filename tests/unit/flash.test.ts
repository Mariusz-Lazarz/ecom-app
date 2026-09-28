import { beforeEach, describe, expect, it, vi } from "vitest"

const set = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: async () => ({ set }) }))

const { flash } = await import("@/lib/flash")

describe("flash", () => {
  beforeEach(() => {
    set.mockReset()
  })

  it("stores the notification as JSON in a short-lived cookie the client can read", async () => {
    await flash({ type: "success", title: "Saved", description: "All good." })

    expect(set).toHaveBeenCalledExactlyOnceWith(
      "flash",
      JSON.stringify({ type: "success", title: "Saved", description: "All good." }),
      { path: "/", maxAge: 60, sameSite: "lax", httpOnly: false },
    )
  })

  it("stores a notification without a description as given", async () => {
    await flash({ type: "error", title: "Could not save" })

    expect(set.mock.calls[0][1]).toBe('{"type":"error","title":"Could not save"}')
  })
})
