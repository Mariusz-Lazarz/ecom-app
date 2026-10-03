import { describe, expect, it } from "vitest"

import {
  applyCartChange,
  checkoutBlocker,
  FREE_SHIPPING_THRESHOLD_CENTS,
  freeShippingProgress,
  lineLimit,
  summarize,
} from "@/lib/cart-state"

import { makeCart, makeCartItem } from "./fixtures/cart"

describe("lineLimit", () => {
  it("is the stock, capped at 99, and 0 when out of stock", () => {
    expect(lineLimit(0)).toBe(0)
    expect(lineLimit(-3)).toBe(0)
    expect(lineLimit(1)).toBe(1)
    expect(lineLimit(98)).toBe(98)
    expect(lineLimit(99)).toBe(99)
    expect(lineLimit(100)).toBe(99)
  })
})

describe("summarize", () => {
  it("returns zeros and the fallback currency for no items", () => {
    expect(summarize([], "EUR")).toEqual({ items: [], itemCount: 0, subtotalCents: 0, savingsCents: 0, currency: "EUR" })
  })

  it("counts every line but totals and savings only available ones", () => {
    const sale = makeCartItem({ priceCents: 2500, compareAtCents: 3000, onSale: true, quantity: 2 })
    const regular = makeCartItem({ priceCents: 1000, quantity: 3 })
    const gone = makeCartItem({ priceCents: 9900, compareAtCents: 12000, onSale: true, quantity: 4, stock: 0 })

    const cart = summarize([sale, regular, gone], "USD")

    expect(cart.itemCount).toBe(9)
    expect(cart.subtotalCents).toBe(2 * 2500 + 3 * 1000)
    expect(cart.savingsCents).toBe(2 * 500)
  })

  it("ignores a compare-at price on a line that isn't on sale", () => {
    const cart = summarize([makeCartItem({ priceCents: 1000, compareAtCents: 1500, onSale: false, quantity: 2 })], "USD")
    expect(cart.savingsCents).toBe(0)
  })
})

describe("applyCartChange", () => {
  const a = makeCartItem({ priceCents: 1000, quantity: 1, stock: 5 })
  const b = makeCartItem({ priceCents: 2000, compareAtCents: 2500, onSale: true, quantity: 2, stock: 10 })
  const cart = makeCart([a, b])

  it("sets a line's quantity and recomputes its total, the flags and the cart totals", () => {
    const next = applyCartChange(cart, { type: "quantity", productId: b.productId, quantity: 4 })

    expect(next.items[1]).toMatchObject({ quantity: 4, lineTotalCents: 8000, limited: false })
    expect(next.items[0]).toBe(a)
    expect(next).toMatchObject({ itemCount: 5, subtotalCents: 9000, savingsCents: 2000 })
  })

  it("flags a line as limited when set above its stock", () => {
    const next = applyCartChange(cart, { type: "quantity", productId: a.productId, quantity: 6 })
    expect(next.items[0].limited).toBe(true)
  })

  it("removes a line on quantity 0 and on remove", () => {
    for (const change of [
      { type: "quantity", productId: a.productId, quantity: 0 },
      { type: "remove", productId: a.productId },
    ] as const) {
      const next = applyCartChange(cart, change)
      expect(next.items.map((item) => item.productId)).toEqual([b.productId])
      expect(next).toMatchObject({ itemCount: 2, subtotalCents: 4000, savingsCents: 1000 })
    }
  })

  it("leaves the cart as it is for an unknown product", () => {
    expect(applyCartChange(cart, { type: "remove", productId: "nope" })).toEqual(cart)
  })

  it("empties the cart on clear, keeping the currency", () => {
    expect(applyCartChange(cart, { type: "clear" })).toEqual({
      items: [],
      itemCount: 0,
      subtotalCents: 0,
      savingsCents: 0,
      currency: "USD",
    })
  })
})

describe("freeShippingProgress", () => {
  it("uses the $50 threshold from the shipping rules", () => {
    expect(FREE_SHIPPING_THRESHOLD_CENTS).toBe(5000)
  })

  it("is 0% with the whole threshold to go for an empty subtotal", () => {
    expect(freeShippingProgress(0)).toEqual({ unlocked: false, remainingCents: 5000, percent: 0 })
  })

  it("is still locked one cent under the threshold", () => {
    expect(freeShippingProgress(4999)).toEqual({ unlocked: false, remainingCents: 1, percent: 99 })
    expect(freeShippingProgress(2500)).toEqual({ unlocked: false, remainingCents: 2500, percent: 50 })
  })

  it("unlocks exactly at the threshold and stays at 100% above it", () => {
    expect(freeShippingProgress(5000)).toEqual({ unlocked: true, remainingCents: 0, percent: 100 })
    expect(freeShippingProgress(12000)).toEqual({ unlocked: true, remainingCents: 0, percent: 100 })
  })
})

describe("checkoutBlocker", () => {
  it("lets a cart of buyable lines through, including a line at exactly its stock", () => {
    expect(checkoutBlocker(makeCart([makeCartItem({ quantity: 2, stock: 2 }), makeCartItem()]))).toBeNull()
  })

  it("blocks an empty cart", () => {
    expect(checkoutBlocker(makeCart([]))).toBe("Your cart is empty.")
  })

  it("blocks out-of-stock lines before over-stock ones", () => {
    const cart = makeCart([makeCartItem({ quantity: 3, stock: 1 }), makeCartItem({ stock: 0 })])
    expect(checkoutBlocker(cart)).toBe("Remove the out-of-stock items to check out.")
  })

  it("blocks a line asking for one more than is in stock", () => {
    expect(checkoutBlocker(makeCart([makeCartItem({ quantity: 3, stock: 2 })]))).toBe(
      "Reduce the quantities to what's in stock to check out.",
    )
  })
})
