import { describe, expect, it } from "vitest"

import { BadRequestError } from "@/lib/errors"
import {
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  RESTOCKING_STATUSES,
  canCustomerCancel,
  canTransition,
  findPaymentMethod,
  findShippingMethod,
  isOrderStatus,
  quoteCheckout,
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
