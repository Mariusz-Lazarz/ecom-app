import * as z from "zod"
import { describe, expect, it } from "vitest"

import { CheckoutSchema, SUPPORTED_COUNTRIES } from "@/lib/validation/checkout"
import { OrderListQuerySchema, OrderNumberSchema, OrderStatusChangeSchema } from "@/lib/validation/orders"

const valid = {
  fullName: "  Jan Kowalski ",
  line1: "ul. Długa 5",
  line2: "",
  city: "Gdańsk",
  postalCode: "80-831",
  country: "pl",
  phone: "+48 600 100 200",
  shippingMethodId: "standard",
  paymentMethodId: "cards",
}

const fieldErrors = (input: Record<string, unknown>) => {
  const result = CheckoutSchema.safeParse(input)
  return result.success ? {} : z.flattenError(result.error).fieldErrors
}

describe("CheckoutSchema", () => {
  it("accepts a valid address and normalises it", () => {
    expect(CheckoutSchema.parse(valid)).toEqual({
      fullName: "Jan Kowalski",
      line1: "ul. Długa 5",
      line2: null,
      city: "Gdańsk",
      postalCode: "80-831",
      country: "PL",
      phone: "+48 600 100 200",
      shippingMethodId: "standard",
      paymentMethodId: "cards",
    })
  })

  it("keeps a given line 2 and upper-cases postal codes", () => {
    expect(CheckoutSchema.parse({ ...valid, line2: " Flat 3 ", postalCode: "sw1a 1aa", country: "GB" })).toMatchObject({
      line2: "Flat 3",
      postalCode: "SW1A 1AA",
      country: "GB",
    })
  })

  it("requires every field but line 2", () => {
    expect(Object.keys(fieldErrors({})).sort()).toEqual(
      ["city", "country", "fullName", "line1", "paymentMethodId", "phone", "postalCode", "shippingMethodId"].sort(),
    )
    expect(fieldErrors({ ...valid, fullName: "   ", city: "" })).toEqual({
      fullName: ["Full name must be at least 2 characters."],
      city: ["City is required."],
    })
  })

  it("enforces lengths at the boundaries", () => {
    expect(fieldErrors({ ...valid, fullName: "Al" })).toEqual({})
    expect(fieldErrors({ ...valid, fullName: "A" }).fullName).toBeDefined()
    expect(fieldErrors({ ...valid, fullName: "a".repeat(100) })).toEqual({})
    expect(fieldErrors({ ...valid, fullName: "a".repeat(101) }).fullName).toEqual(["Full name must be at most 100 characters."])
    expect(fieldErrors({ ...valid, line2: "x".repeat(121) }).line2).toBeDefined()
    expect(fieldErrors({ ...valid, postalCode: "1" }).postalCode).toBeDefined()
    expect(fieldErrors({ ...valid, postalCode: "1".repeat(17) }).postalCode).toBeDefined()
  })

  it("rejects malformed postal codes and phones", () => {
    expect(fieldErrors({ ...valid, postalCode: "80/831" }).postalCode).toEqual(["Please enter a valid postal code."])
    expect(fieldErrors({ ...valid, postalCode: "-80831" }).postalCode).toBeDefined()
    expect(fieldErrors({ ...valid, phone: "call me maybe" }).phone).toEqual(["Please enter a valid phone number."])
    expect(fieldErrors({ ...valid, phone: "+1 (2) 3-4" }).phone).toEqual(["Please enter a valid phone number."])
    expect(fieldErrors({ ...valid, phone: "(415) 555-0134" })).toEqual({})
  })

  it("only accepts supported countries", () => {
    expect(fieldErrors({ ...valid, country: "JP" }).country).toEqual(["We don't ship to this country."])
    expect(fieldErrors({ ...valid, country: "POL" }).country).toBeDefined()
    for (const { code } of SUPPORTED_COUNTRIES) expect(fieldErrors({ ...valid, country: code })).toEqual({})
  })

  it("only accepts configured shipping and payment methods", () => {
    expect(fieldErrors({ ...valid, shippingMethodId: "drone", paymentMethodId: "barter" })).toEqual({
      shippingMethodId: ["Choose a shipping method."],
      paymentMethodId: ["Choose a payment method."],
    })
    expect(fieldErrors({ ...valid, shippingMethodId: "pickup", paymentMethodId: "gift-cards" })).toEqual({})
  })
})

describe("OrderStatusChangeSchema", () => {
  it("accepts a status with an optional note, treating blanks as not given", () => {
    expect(OrderStatusChangeSchema.parse({ status: "processing", note: "  ", trackingNumber: "" })).toEqual({
      status: "processing",
      note: undefined,
      trackingNumber: undefined,
    })
    expect(OrderStatusChangeSchema.parse({ status: "rejected", note: " Fraud check " })).toMatchObject({
      note: "Fraud check",
    })
  })

  it("allows a tracking number only when shipping", () => {
    expect(OrderStatusChangeSchema.parse({ status: "shipped", trackingNumber: " 1Z-999 " })).toMatchObject({
      trackingNumber: "1Z-999",
    })
    const result = OrderStatusChangeSchema.safeParse({ status: "delivered", trackingNumber: "1Z999" })
    expect(result.success).toBe(false)
    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      trackingNumber: ["A tracking number can only be set when the order ships."],
    })
  })

  it("rejects unknown statuses, long notes and odd tracking numbers", () => {
    expect(OrderStatusChangeSchema.safeParse({ status: "lost" }).success).toBe(false)
    expect(OrderStatusChangeSchema.safeParse({}).success).toBe(false)
    expect(OrderStatusChangeSchema.safeParse({ status: "cancelled", note: "x".repeat(500) }).success).toBe(true)
    expect(OrderStatusChangeSchema.safeParse({ status: "cancelled", note: "x".repeat(501) }).success).toBe(false)
    expect(OrderStatusChangeSchema.safeParse({ status: "shipped", trackingNumber: "1Z 999" }).success).toBe(false)
    expect(OrderStatusChangeSchema.safeParse({ status: "shipped", trackingNumber: "1".repeat(65) }).success).toBe(false)
  })
})

describe("OrderNumberSchema", () => {
  it("normalises case and spaces and rejects other shapes", () => {
    expect(OrderNumberSchema.parse(" nc-10001 ")).toBe("NC-10001")
    expect(OrderNumberSchema.safeParse("10001").success).toBe(false)
    expect(OrderNumberSchema.safeParse("NC-").success).toBe(false)
    expect(OrderNumberSchema.safeParse("NC-1; DROP TABLE orders").success).toBe(false)
  })
})

describe("OrderListQuerySchema", () => {
  it("applies defaults and drops empty params", () => {
    expect(OrderListQuerySchema.parse({ status: "", q: " " })).toEqual({ page: 1, pageSize: 20, status: undefined, q: undefined })
  })

  it("coerces and bounds pagination and checks the status", () => {
    expect(OrderListQuerySchema.parse({ page: "3", pageSize: ["50", "10"], status: "shipped", q: " NC-1 " })).toEqual({
      page: 3,
      pageSize: 50,
      status: "shipped",
      q: "NC-1",
    })
    expect(OrderListQuerySchema.safeParse({ page: "0" }).success).toBe(false)
    expect(OrderListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false)
    expect(OrderListQuerySchema.safeParse({ status: "lost" }).success).toBe(false)
  })
})
