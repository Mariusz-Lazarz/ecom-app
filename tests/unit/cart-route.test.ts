import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const getCart = vi.fn()
vi.mock("@/lib/cart", () => ({ getCart }))

const { GET } = await import("@/app/api/cart/route")

const call = () => GET(new Request("http://localhost/api/cart"), {} as never)

describe("GET /api/cart", () => {
  beforeEach(() => {
    getCart.mockReset()
  })

  it("returns the current visitor's cart", async () => {
    const cart = { items: [], itemCount: 0, subtotalCents: 0, savingsCents: 0, currency: "USD" }
    getCart.mockResolvedValue(cart)

    const res = await call()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cart })
  })

  it("answers with a generic 500 when reading the cart fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    getCart.mockRejectedValue(new Error("connection refused"))

    const res = await call()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: { code: "internal_error", message: "Something went wrong. Please try again." },
    })
    spy.mockRestore()
  })
})
