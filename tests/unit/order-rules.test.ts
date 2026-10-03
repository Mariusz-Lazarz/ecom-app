import { describe, expect, it } from "vitest"

import { BadRequestError } from "@/lib/errors"
import {
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  RESTOCKING_STATUSES,
  canCustomerCancel,
  canTransition,
  checkDiscountCode,
  describeDiscount,
  discountOnSubtotal,
  discountProblemMessage,
  findPaymentMethod,
  findShippingMethod,
  isOrderStatus,
  normalizeDiscountCode,
  quoteCheckout,
  type DiscountCodeState,
  type DiscountRule,
} from "@/lib/order-rules"

const line = (priceCents: number, quantity = 1, compareAtCents: number | null = null, available?: boolean) => ({
  priceCents,
  quantity,
  compareAtCents,
  available,
})

describe("ORDER_TRANSITIONS", () => {
  it("is the agreed status machine", () => {
    expect(ORDER_TRANSITIONS).toEqual({
      pending: ["processing", "cancelled", "rejected"],
      processing: ["shipped", "cancelled", "rejected"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
      rejected: [],
    })
  })

  it("covers every status and only targets known statuses, never the same one", () => {
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort())
    for (const [from, targets] of Object.entries(ORDER_TRANSITIONS)) {
      for (const to of targets) {
        expect(ORDER_STATUSES).toContain(to)
        expect(to).not.toBe(from)
      }
    }
  })

  it("never leads back to pending", () => {
    expect(Object.values(ORDER_TRANSITIONS).flat()).not.toContain("pending")
  })

  it("canTransition follows the map", () => {
    expect(canTransition("pending", "processing")).toBe(true)
    expect(canTransition("processing", "rejected")).toBe(true)
    expect(canTransition("shipped", "delivered")).toBe(true)
    expect(canTransition("pending", "shipped")).toBe(false)
    expect(canTransition("shipped", "cancelled")).toBe(false)
    expect(canTransition("delivered", "cancelled")).toBe(false)
    expect(canTransition("pending", "pending")).toBe(false)
  })

  it("lets customers cancel only pending orders, and restocks on cancelled/rejected", () => {
    expect(CUSTOMER_CANCELLABLE_STATUSES).toEqual(["pending"])
    expect(ORDER_STATUSES.filter(canCustomerCancel)).toEqual(["pending"])
    expect(RESTOCKING_STATUSES).toEqual(["cancelled", "rejected"])
  })

  it("recognises statuses", () => {
    expect(isOrderStatus("shipped")).toBe(true)
    expect(isOrderStatus("SHIPPED")).toBe(false)
    expect(isOrderStatus("")).toBe(false)
    expect(isOrderStatus(undefined)).toBe(false)
  })
})

describe("quoteCheckout", () => {
  it("adds up lines, savings and paid standard shipping below the threshold", () => {
    const quote = quoteCheckout({ items: [line(1500, 2, 2000), line(999)] }, "standard")
    expect(quote).toMatchObject({
      subtotalCents: 3999,
      savingsCents: 1000,
      shippingCents: 599,
      totalCents: 4598,
      freeShipping: false,
      shippingMethodPriceCents: 599,
    })
    expect(quote.shippingMethod.id).toBe("standard")
  })

  it("makes standard shipping free from exactly the threshold, not a cent below", () => {
    expect(quoteCheckout({ items: [line(4999)] }, "standard")).toMatchObject({ shippingCents: 599, totalCents: 5598 })
    expect(quoteCheckout({ items: [line(5000)] }, "standard")).toMatchObject({
      shippingCents: 0,
      totalCents: 5000,
      freeShipping: true,
    })
  })

  it("charges methods that aren't free-eligible at any subtotal", () => {
    expect(quoteCheckout({ items: [line(100_000)] }, "express")).toMatchObject({ shippingCents: 1299, freeShipping: false })
    expect(quoteCheckout({ items: [line(100_000)] }, "next-day")).toMatchObject({ shippingCents: 1999 })
    expect(quoteCheckout({ items: [line(100)] }, "pickup")).toMatchObject({ shippingCents: 0, freeShipping: false })
  })

  it("skips unavailable lines and ignores a compare-at price that isn't higher", () => {
    const quote = quoteCheckout({ items: [line(6000, 1, 9000, false), line(1000, 1, 1000)] }, "standard")
    expect(quote).toMatchObject({ subtotalCents: 1000, savingsCents: 0, shippingCents: 599 })
  })

  it("quotes an empty cart as shipping only", () => {
    expect(quoteCheckout({ items: [] }, "standard")).toMatchObject({ subtotalCents: 0, totalCents: 599 })
  })

  it("rejects an unknown shipping method", () => {
    expect(() => quoteCheckout({ items: [line(100)] }, "teleport")).toThrow(BadRequestError)
  })

  it("finds methods by id", () => {
    expect(findShippingMethod("express")?.name).toBe("Express")
    expect(findShippingMethod("nope")).toBeUndefined()
    expect(findPaymentMethod("wallets")?.name).toBe("Digital wallets")
    expect(findPaymentMethod("")).toBeUndefined()
  })
})

const rule = (type: DiscountRule["type"], value: number, minSubtotalCents = 0): DiscountRule => ({
  code: "TEST",
  type,
  value,
  minSubtotalCents,
})

describe("quoteCheckout with a discount code", () => {
  it("takes a percentage off the subtotal and keeps total = subtotal − discount + shipping", () => {
    const quote = quoteCheckout({ items: [line(1500, 2, 2000), line(999)] }, "standard", rule("percent", 10))
    expect(quote).toMatchObject({
      subtotalCents: 3999,
      savingsCents: 1000,
      // 10% of 39.99 is 3.999, rounded half up to 4.00.
      discountCents: 400,
      shippingDiscountCents: 0,
      shippingCents: 599,
      totalCents: 3999 - 400 + 599,
      discount: rule("percent", 10),
    })
  })

  it.each([
    // [subtotal, percent, discount]: half a cent rounds up, less than half rounds down.
    [1005, 10, 101], // 100.5
    [1004, 10, 100], // 100.4
    [1015, 10, 102], // 101.5
    [333, 33, 110], // 109.89
    [1, 50, 1], // 0.5
    [1, 49, 0], // 0.49
    [4999, 15, 750], // 749.85
    [12345, 100, 12345],
  ])("rounds %i × %i%% to %i cents", (subtotal, percent, expected) => {
    expect(discountOnSubtotal(rule("percent", percent), subtotal)).toBe(expected)
    expect(quoteCheckout({ items: [line(subtotal)] }, "pickup", rule("percent", percent))).toMatchObject({
      discountCents: expected,
      totalCents: subtotal - expected,
    })
  })

  it("caps a fixed amount at the subtotal, so the total never drops below shipping", () => {
    expect(quoteCheckout({ items: [line(2000)] }, "standard", rule("fixed", 1500))).toMatchObject({
      discountCents: 1500,
      totalCents: 2000 - 1500 + 599,
    })
    expect(quoteCheckout({ items: [line(999)] }, "standard", rule("fixed", 1500))).toMatchObject({
      discountCents: 999,
      shippingCents: 599,
      totalCents: 599,
    })
    expect(quoteCheckout({ items: [line(999)] }, "pickup", rule("fixed", 1500))).toMatchObject({ totalCents: 0 })
  })

  it("never quotes a negative total, even for 100% off with free shipping", () => {
    for (const discount of [rule("percent", 100), rule("fixed", 1_000_000)]) {
      const quote = quoteCheckout({ items: [line(1234, 3)] }, "pickup", discount)
      expect(quote.totalCents).toBe(0)
      expect(quote.discountCents).toBe(3702)
    }
  })

  it("zeroes shipping with a free-shipping code, for any method, and takes nothing off the subtotal", () => {
    for (const [method, price] of [
      ["standard", 599],
      ["express", 1299],
      ["next-day", 1999],
    ] as const) {
      expect(quoteCheckout({ items: [line(1000)] }, method, rule("free_shipping", 0))).toMatchObject({
        discountCents: 0,
        shippingDiscountCents: price,
        shippingCents: 0,
        totalCents: 1000,
        // The threshold didn't waive it; the code did.
        freeShipping: false,
        shippingMethodPriceCents: price,
      })
    }
  })

  it("saves nothing with a free-shipping code when the threshold already made shipping free", () => {
    expect(quoteCheckout({ items: [line(5000)] }, "standard", rule("free_shipping", 0))).toMatchObject({
      freeShipping: true,
      shippingDiscountCents: 0,
      shippingCents: 0,
      totalCents: 5000,
      discount: rule("free_shipping", 0),
    })
    // Express is never free-eligible, so the code still waives it above the threshold.
    expect(quoteCheckout({ items: [line(5000)] }, "express", rule("free_shipping", 0))).toMatchObject({
      shippingDiscountCents: 1299,
      shippingCents: 0,
      totalCents: 5000,
    })
  })

  it("checks the free-shipping threshold against the subtotal before the code", () => {
    // 50.00 − 10% = 45.00 to pay for goods, but the subtotal reached 50.00, so standard ships free.
    expect(quoteCheckout({ items: [line(5000)] }, "standard", rule("percent", 10))).toMatchObject({
      discountCents: 500,
      shippingCents: 0,
      freeShipping: true,
      totalCents: 4500,
    })
  })

  it("applies a code from exactly its minimum subtotal and leaves it out a cent below", () => {
    expect(quoteCheckout({ items: [line(2999)] }, "standard", rule("percent", 10, 3000))).toMatchObject({
      discount: null,
      discountCents: 0,
      totalCents: 2999 + 599,
    })
    expect(quoteCheckout({ items: [line(3000)] }, "standard", rule("percent", 10, 3000))).toMatchObject({
      discount: rule("percent", 10, 3000),
      discountCents: 300,
      totalCents: 3000 - 300 + 599,
    })
    expect(discountOnSubtotal(rule("fixed", 500, 3000), 2999)).toBe(0)
  })

  it("leaves out unavailable lines when working out the discount", () => {
    const quote = quoteCheckout({ items: [line(10_000, 1, null, false), line(2000)] }, "standard", rule("percent", 50))
    expect(quote).toMatchObject({ subtotalCents: 2000, discountCents: 1000, totalCents: 1000 + 599 })
  })

  it("quotes without a code exactly as before", () => {
    expect(quoteCheckout({ items: [line(1000)] }, "standard")).toMatchObject({
      discount: null,
      discountCents: 0,
      shippingDiscountCents: 0,
      totalCents: 1599,
    })
  })
})

describe("checkDiscountCode", () => {
  const now = new Date("2026-06-15T12:00:00Z")
  const code = (overrides: Partial<DiscountCodeState> = {}): DiscountCodeState => ({
    code: "WELCOME10",
    type: "percent",
    value: 10,
    minSubtotalCents: 3000,
    active: true,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    perUserLimit: 1,
    redemptionCount: 0,
    userRedemptionCount: 0,
    ...overrides,
  })

  it("accepts a usable code and returns its rule", () => {
    expect(checkDiscountCode(code(), 3000, now)).toEqual({
      ok: true,
      rule: { code: "WELCOME10", type: "percent", value: 10, minSubtotalCents: 3000 },
    })
  })

  it("rejects an unknown code", () => {
    expect(checkDiscountCode(null, 10_000, now)).toEqual({ ok: false, problem: { reason: "unknown" } })
  })

  it("rejects an inactive code", () => {
    expect(checkDiscountCode(code({ active: false }), 10_000, now)).toEqual({ ok: false, problem: { reason: "inactive" } })
  })

  it("rejects a code before its start and accepts it from the start instant", () => {
    const startsAt = new Date("2026-06-15T12:00:00.001Z")
    expect(checkDiscountCode(code({ startsAt }), 10_000, now)).toEqual({
      ok: false,
      problem: { reason: "not_started", startsAt },
    })
    expect(checkDiscountCode(code({ startsAt: now }), 10_000, now).ok).toBe(true)
  })

  it("rejects a code from its end instant on and accepts it just before", () => {
    expect(checkDiscountCode(code({ endsAt: now }), 10_000, now)).toEqual({ ok: false, problem: { reason: "expired" } })
    expect(checkDiscountCode(code({ endsAt: new Date(now.getTime() + 1) }), 10_000, now).ok).toBe(true)
  })

  it("rejects a code whose total uses are taken, and allows the last one", () => {
    expect(checkDiscountCode(code({ maxRedemptions: 5, redemptionCount: 5 }), 10_000, now)).toEqual({
      ok: false,
      problem: { reason: "max_redemptions" },
    })
    expect(checkDiscountCode(code({ maxRedemptions: 5, redemptionCount: 4 }), 10_000, now).ok).toBe(true)
  })

  it("rejects a code the customer has used up, and allows unlimited use without a per-customer limit", () => {
    expect(checkDiscountCode(code({ perUserLimit: 1, userRedemptionCount: 1 }), 10_000, now)).toEqual({
      ok: false,
      problem: { reason: "already_used" },
    })
    expect(checkDiscountCode(code({ perUserLimit: 2, userRedemptionCount: 1 }), 10_000, now).ok).toBe(true)
    expect(checkDiscountCode(code({ perUserLimit: null, userRedemptionCount: 40 }), 10_000, now).ok).toBe(true)
  })

  it("rejects a subtotal a cent under the minimum, saying how much is missing", () => {
    expect(checkDiscountCode(code(), 2999, now)).toEqual({
      ok: false,
      problem: { reason: "below_minimum", minSubtotalCents: 3000, shortByCents: 1 },
    })
    expect(checkDiscountCode(code(), 0, now)).toEqual({
      ok: false,
      problem: { reason: "below_minimum", minSubtotalCents: 3000, shortByCents: 3000 },
    })
  })

  it("reports what the customer can't fix before the minimum subtotal", () => {
    const everythingWrong = code({ endsAt: now, maxRedemptions: 1, redemptionCount: 1, userRedemptionCount: 1 })
    expect(checkDiscountCode(everythingWrong, 0, now)).toMatchObject({ problem: { reason: "expired" } })
    expect(checkDiscountCode(code({ userRedemptionCount: 1 }), 0, now)).toMatchObject({ problem: { reason: "already_used" } })
  })
})

describe("discount messages", () => {
  it("explains every problem", () => {
    expect(discountProblemMessage("NOPE", { reason: "unknown" })).toBe("NOPE isn't a valid discount code.")
    expect(discountProblemMessage("OLD", { reason: "inactive" })).toBe("OLD is no longer available.")
    expect(
      discountProblemMessage("SOON", { reason: "not_started", startsAt: new Date("2026-12-01T00:00:00Z") }),
    ).toBe("SOON can't be used yet. It starts on Dec 1, 2026.")
    expect(discountProblemMessage("EXPIRED5", { reason: "expired" })).toBe("EXPIRED5 has expired.")
    expect(discountProblemMessage("ONCE20", { reason: "max_redemptions" })).toBe("ONCE20 has reached its usage limit.")
    expect(discountProblemMessage("WELCOME10", { reason: "already_used" })).toBe("You've already used WELCOME10.")
    expect(
      discountProblemMessage("WELCOME10", { reason: "below_minimum", minSubtotalCents: 3000, shortByCents: 1 }),
    ).toBe("WELCOME10 needs a subtotal of at least $30.00. Add $0.01 more to use it.")
  })

  it("describes rules", () => {
    expect(describeDiscount({ type: "percent", value: 10 })).toBe("10% off")
    expect(describeDiscount({ type: "fixed", value: 1500 })).toBe("$15.00 off")
    expect(describeDiscount({ type: "free_shipping", value: 0 })).toBe("Free shipping")
  })

  it("normalises typed codes", () => {
    expect(normalizeDiscountCode("  welcome10 ")).toBe("WELCOME10")
  })
})
