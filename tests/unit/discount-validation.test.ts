import * as z from "zod"
import { describe, expect, it } from "vitest"

import {
  DiscountCodeEntrySchema,
  DiscountCodeFormSchema,
  discountValueToInput,
  endsAtToDateInput,
  startsAtToDateInput,
} from "@/lib/validation/discounts"

const form = (overrides: Record<string, unknown> = {}) => ({
  code: "spring20",
  description: "Spring sale",
  type: "percent",
  value: "20",
  minSubtotal: "",
  startsOn: "",
  endsOn: "",
  maxRedemptions: "",
  perUserLimit: "1",
  active: true,
  ...overrides,
})

const fieldErrors = (input: Record<string, unknown>) => {
  const result = DiscountCodeFormSchema.safeParse(input)
  expect(result.success).toBe(false)
  return z.flattenError(result.error!).fieldErrors as Record<string, string[] | undefined>
}

describe("DiscountCodeFormSchema", () => {
  it("parses a percent code: upper-cased code, empty optional fields as defaults", () => {
    expect(DiscountCodeFormSchema.parse(form())).toEqual({
      code: "SPRING20",
      description: "Spring sale",
      type: "percent",
      value: 20,
      minSubtotalCents: 0,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      perUserLimit: 1,
      active: true,
    })
  })

  it("reads a fixed amount and the minimum subtotal as cents", () => {
    expect(DiscountCodeFormSchema.parse(form({ type: "fixed", value: "15", minSubtotal: "$1,000.50" }))).toMatchObject({
      type: "fixed",
      value: 1500,
      minSubtotalCents: 100050,
    })
    expect(DiscountCodeFormSchema.parse(form({ type: "fixed", value: "0.01" })).value).toBe(1)
  })

  it("stores 0 for a free-shipping code, whatever the value field says", () => {
    expect(DiscountCodeFormSchema.parse(form({ type: "free_shipping", value: "abc" })).value).toBe(0)
    expect(DiscountCodeFormSchema.parse(form({ type: "free_shipping", value: undefined })).value).toBe(0)
  })

  it.each(["0", "101", "10.5", "", "ten", "-5"])("rejects %j as a percent", (value) => {
    expect(fieldErrors(form({ value })).value).toEqual(["Percent off must be a whole number from 1 to 100."])
  })

  it("accepts the percent bounds 1 and 100", () => {
    expect(DiscountCodeFormSchema.parse(form({ value: "1" })).value).toBe(1)
    expect(DiscountCodeFormSchema.parse(form({ value: "100" })).value).toBe(100)
  })

  it.each(["0", "0.00", "", "12,5", "1.234", "abc"])("rejects %j as a fixed amount", (value) => {
    expect(fieldErrors(form({ type: "fixed", value })).value).toEqual(["Amount off must be an amount like 15 or 4.99."])
  })

  it("validates the code's characters and length", () => {
    expect(fieldErrors(form({ code: "" })).code).toEqual(["Code is required."])
    expect(fieldErrors(form({ code: "ab" })).code).toEqual(["Use 3–32 letters, digits, dashes or underscores."])
    expect(fieldErrors(form({ code: "has space" })).code).toEqual(["Use 3–32 letters, digits, dashes or underscores."])
    expect(fieldErrors(form({ code: "X".repeat(33) })).code).toEqual(["Use 3–32 letters, digits, dashes or underscores."])
    expect(DiscountCodeFormSchema.parse(form({ code: " summer_sale-2 " })).code).toBe("SUMMER_SALE-2")
    expect(DiscountCodeFormSchema.parse(form({ code: "X".repeat(32) })).code).toHaveLength(32)
  })

  it("rejects an unknown type", () => {
    expect(fieldErrors(form({ type: "bogo" })).type).toEqual(["Choose a discount type."])
  })

  it("turns dates into whole UTC days, the end date being inclusive", () => {
    expect(DiscountCodeFormSchema.parse(form({ startsOn: "2026-10-01", endsOn: "2026-10-31" }))).toMatchObject({
      startsAt: new Date("2026-10-01T00:00:00Z"),
      endsAt: new Date("2026-11-01T00:00:00Z"),
    })
    // A one-day code.
    expect(DiscountCodeFormSchema.parse(form({ startsOn: "2026-10-01", endsOn: "2026-10-01" }))).toMatchObject({
      startsAt: new Date("2026-10-01T00:00:00Z"),
      endsAt: new Date("2026-10-02T00:00:00Z"),
    })
  })

  it("rejects an end date before the start date, and dates that don't exist", () => {
    expect(fieldErrors(form({ startsOn: "2026-10-02", endsOn: "2026-10-01" })).endsOn).toEqual([
      "End date must be on or after the start date.",
    ])
    expect(fieldErrors(form({ startsOn: "2026-02-30" })).startsOn).toEqual(["Start date must be a date."])
    expect(fieldErrors(form({ endsOn: "tomorrow" })).endsOn).toEqual(["End date must be a date."])
  })

  it("reads the limits: empty is unlimited, otherwise a whole number from 1", () => {
    expect(DiscountCodeFormSchema.parse(form({ maxRedemptions: "100", perUserLimit: "" }))).toMatchObject({
      maxRedemptions: 100,
      perUserLimit: null,
    })
    expect(fieldErrors(form({ maxRedemptions: "0" })).maxRedemptions).toEqual([
      "Total uses must be a whole number, 1 or more, or empty.",
    ])
    expect(fieldErrors(form({ perUserLimit: "1.5" })).perUserLimit).toEqual([
      "Uses per customer must be a whole number, 1 or more, or empty.",
    ])
    expect(fieldErrors(form({ maxRedemptions: "1000001" })).maxRedemptions).toEqual(["Total uses must be at most 1000000."])
  })

  it("rejects a minimum subtotal that isn't an amount", () => {
    expect(fieldErrors(form({ minSubtotal: "lots" })).minSubtotal).toEqual([
      "Minimum subtotal must be an amount like 30 or 29.99, or empty.",
    ])
  })

  it("limits the description", () => {
    expect(fieldErrors(form({ description: "x".repeat(201) })).description).toEqual([
      "Description must be at most 200 characters.",
    ])
    expect(DiscountCodeFormSchema.parse(form({ description: undefined })).description).toBe("")
  })
})

describe("DiscountCodeEntrySchema", () => {
  it("trims and upper-cases what the customer typed", () => {
    expect(DiscountCodeEntrySchema.parse("  welcome10 ")).toBe("WELCOME10")
  })

  it("asks for a code when empty and rejects absurdly long input", () => {
    expect(DiscountCodeEntrySchema.safeParse("   ").error?.issues[0].message).toBe("Enter a discount code.")
    expect(DiscountCodeEntrySchema.safeParse(undefined).error?.issues[0].message).toBe("Enter a discount code.")
    expect(DiscountCodeEntrySchema.safeParse("A".repeat(33)).error?.issues[0].message).toBe("That code is too long.")
  })
})

describe("form value helpers", () => {
  it("shows stored values the way the form takes them", () => {
    expect(discountValueToInput("percent", 15)).toBe("15")
    expect(discountValueToInput("fixed", 1500)).toBe("15.00")
    expect(discountValueToInput("free_shipping", 0)).toBe("")
  })

  it("shows stored dates as the days entered, and empty without one", () => {
    expect(startsAtToDateInput(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10-01")
    expect(endsAtToDateInput(new Date("2026-11-01T00:00:00Z"))).toBe("2026-10-31")
    expect(startsAtToDateInput(null)).toBe("")
    expect(endsAtToDateInput(null)).toBe("")
  })
})
