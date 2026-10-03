import { beforeEach, describe, expect, it, vi } from "vitest"

import { ConflictError, NotFoundError, UnauthorizedError } from "@/lib/errors"

const cart = vi.hoisted(() => ({
  addToCart: vi.fn(),
  setQuantity: vi.fn(),
  removeFromCart: vi.fn(),
  clearCart: vi.fn(),
  applyDiscountCode: vi.fn(),
  removeDiscountCode: vi.fn(),
}))
const refresh = vi.fn()

vi.mock("@/lib/cart", () => cart)
vi.mock("next/cache", () => ({ refresh: () => refresh() }))

const { addToCart, updateCartItem, removeCartItem, clearCart, applyDiscountCode, removeDiscountCode } = await import(
  "@/app/actions/cart"
)

const PRODUCT_ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e"

const line = (overrides: Record<string, unknown> = {}) => ({
  productId: PRODUCT_ID,
  requested: 1,
  added: 1,
  quantity: 1,
  stock: 10,
  clamped: false,
  itemCount: 3,
  ...overrides,
})

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

beforeEach(() => {
  for (const fn of Object.values(cart)) fn.mockReset()
  refresh.mockReset()
})

describe("addToCart action", () => {
  it("adds one by default and returns the new count", async () => {
    cart.addToCart.mockResolvedValue(line())

    const result = await addToCart({ productId: PRODUCT_ID })

    expect(cart.addToCart).toHaveBeenCalledExactlyOnceWith(PRODUCT_ID, 1)
    expect(result).toEqual({ ok: true, message: undefined, itemCount: 3, line: line() })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("reads FormData, both directly and as useActionState's (state, formData)", async () => {
    cart.addToCart.mockResolvedValue(line({ requested: 2, added: 2, quantity: 2 }))

    await addToCart(form({ productId: PRODUCT_ID, quantity: "2" }))
    await addToCart({ ok: true, itemCount: 1 }, form({ productId: PRODUCT_ID, quantity: "4" }))
    await addToCart(undefined, form({ productId: PRODUCT_ID }))

    expect(cart.addToCart.mock.calls).toEqual([
      [PRODUCT_ID, 2],
      [PRODUCT_ID, 4],
      [PRODUCT_ID, 1],
    ])
  })

  it("explains a quantity capped by stock", async () => {
    cart.addToCart.mockResolvedValue(line({ requested: 5, added: 2, quantity: 3, stock: 3, clamped: true }))
    expect(await addToCart({ productId: PRODUCT_ID, quantity: 5 })).toMatchObject({
      ok: true,
      message: "Only 3 available, so 2 added to your cart.",
    })

    cart.addToCart.mockResolvedValue(line({ added: 0, quantity: 3, stock: 3, clamped: true }))
    expect(await addToCart({ productId: PRODUCT_ID })).toMatchObject({
      ok: true,
      message: "Only 3 available and they're all in your cart already.",
    })
  })

  it("explains a quantity capped by the 99-per-line limit", async () => {
    cart.addToCart.mockResolvedValue(line({ requested: 50, added: 9, quantity: 99, stock: 500, clamped: true }))
    expect(await addToCart({ productId: PRODUCT_ID, quantity: 50 })).toMatchObject({
      message: "You can have up to 99, so 9 added to your cart.",
    })
  })

  it.each([
    [{ productId: "not-a-uuid" }, { productId: ["Unknown product."] }],
    [{ productId: PRODUCT_ID, quantity: 0 }, { quantity: ["Quantity must be at least 1."] }],
    [{ productId: PRODUCT_ID, quantity: 100 }, { quantity: ["Quantity can't be more than 99."] }],
    [{ productId: PRODUCT_ID, quantity: 1.5 }, { quantity: ["Quantity must be a whole number."] }],
    [{ productId: PRODUCT_ID, quantity: "abc" }, { quantity: ["Quantity must be a number."] }],
    [{}, { productId: ["Unknown product."] }],
  ])("rejects invalid input %j without touching the cart", async (input, errors) => {
    const result = await addToCart(input as never)

    expect(result).toEqual({ ok: false, message: "Please check the item and quantity.", errors })
    expect(cart.addToCart).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("returns the message of an expected domain error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    cart.addToCart.mockRejectedValue(new ConflictError("This product is out of stock."))

    expect(await addToCart({ productId: PRODUCT_ID })).toEqual({ ok: false, message: "This product is out of stock." })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("hides unexpected errors behind a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    cart.addToCart.mockRejectedValue(new Error("connection refused at 10.0.0.5"))

    const result = await addToCart({ productId: PRODUCT_ID })

    expect(result).toEqual({ ok: false, message: "Something went wrong. Please try again." })
    expect(JSON.stringify(result)).not.toContain("10.0.0.5")
  })
})

describe("updateCartItem action", () => {
  it("sets the quantity", async () => {
    cart.setQuantity.mockResolvedValue(line({ requested: 4, added: 0, quantity: 4, itemCount: 4 }))

    const result = await updateCartItem(form({ productId: PRODUCT_ID, quantity: "4" }))

    expect(cart.setQuantity).toHaveBeenCalledExactlyOnceWith(PRODUCT_ID, 4)
    expect(result).toMatchObject({ ok: true, message: undefined, itemCount: 4 })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("accepts 0, which removes the line", async () => {
    cart.setQuantity.mockResolvedValue(line({ requested: 0, added: 0, quantity: 0, itemCount: 0 }))
    expect(await updateCartItem({ productId: PRODUCT_ID, quantity: 0 })).toMatchObject({ ok: true, itemCount: 0 })
    expect(cart.setQuantity).toHaveBeenCalledExactlyOnceWith(PRODUCT_ID, 0)
  })

  it("explains a quantity capped by stock", async () => {
    cart.setQuantity.mockResolvedValue(line({ requested: 9, quantity: 6, stock: 6, clamped: true }))
    expect(await updateCartItem({ productId: PRODUCT_ID, quantity: 9 })).toMatchObject({
      ok: true,
      message: "Only 6 available.",
    })
  })

  it("requires a quantity between 0 and 99", async () => {
    expect(await updateCartItem({ productId: PRODUCT_ID, quantity: -1 })).toMatchObject({
      ok: false,
      errors: { quantity: ["Quantity must be at least 0."] },
    })
    expect(await updateCartItem({ productId: PRODUCT_ID, quantity: 100 })).toMatchObject({ ok: false })
    expect(cart.setQuantity).not.toHaveBeenCalled()
  })

  it("returns the message when the item isn't in the cart", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    cart.setQuantity.mockRejectedValue(new NotFoundError("This item isn't in your cart."))
    expect(await updateCartItem({ productId: PRODUCT_ID, quantity: 2 })).toEqual({
      ok: false,
      message: "This item isn't in your cart.",
    })
  })
})

describe("removeCartItem action", () => {
  it("removes the line", async () => {
    cart.removeFromCart.mockResolvedValue(line({ requested: 0, added: 0, quantity: 0, itemCount: 2 }))

    const result = await removeCartItem(undefined, form({ productId: PRODUCT_ID }))

    expect(cart.removeFromCart).toHaveBeenCalledExactlyOnceWith(PRODUCT_ID)
    expect(result).toMatchObject({ ok: true, itemCount: 2 })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("rejects a malformed product id", async () => {
    expect(await removeCartItem({ productId: "1; DROP TABLE carts" })).toMatchObject({
      ok: false,
      errors: { productId: ["Unknown product."] },
    })
    expect(cart.removeFromCart).not.toHaveBeenCalled()
  })
})

describe("clearCart action", () => {
  it("empties the cart", async () => {
    cart.clearCart.mockResolvedValue(undefined)

    expect(await clearCart()).toEqual({ ok: true, itemCount: 0 })
    expect(cart.clearCart).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("returns a generic message when clearing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    cart.clearCart.mockRejectedValue(new Error("boom"))

    expect(await clearCart()).toEqual({ ok: false, message: "Something went wrong. Please try again." })
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe("applyDiscountCode action", () => {
  it("applies the trimmed, upper-cased code and re-renders the page", async () => {
    cart.applyDiscountCode.mockResolvedValue({ code: "WELCOME10", type: "percent", value: 10, minSubtotalCents: 3000 })

    expect(await applyDiscountCode("  welcome10 ")).toEqual({ ok: true, code: "WELCOME10" })
    expect(cart.applyDiscountCode).toHaveBeenCalledExactlyOnceWith("WELCOME10")
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("asks for a code when the field is empty, without touching the cart", async () => {
    expect(await applyDiscountCode("   ")).toEqual({ ok: false, message: "Enter a discount code." })
    expect(await applyDiscountCode(undefined as unknown as string)).toEqual({ ok: false, message: "Enter a discount code." })
    expect(cart.applyDiscountCode).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("passes on why a code can't be used", async () => {
    cart.applyDiscountCode.mockRejectedValue(new ConflictError("EXPIRED5 has expired."))
    expect(await applyDiscountCode("expired5")).toEqual({ ok: false, message: "EXPIRED5 has expired." })

    cart.applyDiscountCode.mockRejectedValue(new UnauthorizedError("Sign in to use a discount code."))
    expect(await applyDiscountCode("WELCOME10")).toEqual({ ok: false, message: "Sign in to use a discount code." })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("hides unexpected errors behind a generic message", async () => {
    cart.applyDiscountCode.mockRejectedValue(new Error("connection reset"))
    expect(await applyDiscountCode("WELCOME10")).toEqual({ ok: false, message: "Something went wrong. Please try again." })
  })
})

describe("removeDiscountCode action", () => {
  it("removes the code and re-renders the page", async () => {
    cart.removeDiscountCode.mockResolvedValue(undefined)
    expect(await removeDiscountCode()).toEqual({ ok: true })
    expect(cart.removeDiscountCode).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("reports a failure generically", async () => {
    cart.removeDiscountCode.mockRejectedValue(new Error("connection reset"))
    expect(await removeDiscountCode()).toEqual({ ok: false, message: "Something went wrong. Please try again." })
    expect(refresh).not.toHaveBeenCalled()
  })
})
