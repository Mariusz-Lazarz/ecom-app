import { describe, expect, it } from "vitest"

import {
  amountToFreeShipping,
  formatDeliveryWindow,
  shippingCost,
  shippingMethods,
  shippingRules,
} from "@/lib/shipping"

const method = (id: string) => shippingMethods.find((m) => m.id === id)!

describe("shippingCost", () => {
  it("charges the standard rate just below the free threshold", () => {
    expect(shippingCost(49.99, method("standard"))).toBe(5.99)
    expect(shippingCost(0, method("standard"))).toBe(5.99)
  })

  it("makes standard shipping free at and above the threshold", () => {
    expect(shippingCost(shippingRules.freeThreshold, method("standard"))).toBe(0)
    expect(shippingCost(500, method("standard"))).toBe(0)
  })

  it.each(["express", "next-day"])("never waives the %s price", (id) => {
    expect(shippingCost(10, method(id))).toBe(method(id).price)
    expect(shippingCost(1000, method(id))).toBe(method(id).price)
  })

  it("keeps locker pickup free at any subtotal", () => {
    expect(shippingCost(0, method("pickup"))).toBe(0)
    expect(shippingCost(1000, method("pickup"))).toBe(0)
  })
})

describe("amountToFreeShipping", () => {
  it("returns the full threshold for an empty basket", () => {
    expect(amountToFreeShipping(0)).toBe(50)
  })

  it("returns the exact remainder in cents", () => {
    expect(amountToFreeShipping(35)).toBe(15)
    expect(amountToFreeShipping(49.99)).toBe(0.01)
    expect(amountToFreeShipping(33.33)).toBe(16.67)
  })

  it("returns 0 at and above the threshold", () => {
    expect(amountToFreeShipping(50)).toBe(0)
    expect(amountToFreeShipping(120)).toBe(0)
  })
})

describe("formatDeliveryWindow", () => {
  it("formats a range", () => {
    expect(formatDeliveryWindow({ minDays: 3, maxDays: 5 })).toBe("3–5 business days")
  })

  it("uses the singular for exactly one day", () => {
    expect(formatDeliveryWindow({ minDays: 1, maxDays: 1 })).toBe("1 business day")
  })

  it("uses the plural for a fixed multi-day window", () => {
    expect(formatDeliveryWindow({ minDays: 2, maxDays: 2 })).toBe("2 business days")
  })
})
