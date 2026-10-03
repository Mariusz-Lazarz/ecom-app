import { describe, expect, it } from "vitest"

import {
  STATUS_ACTION_LABELS,
  TRACKING_PREFIX,
  adminOrdersHref,
  generateTrackingNumber,
  parseAdminOrderQuery,
} from "@/lib/admin-orders"
import { ORDER_STATUSES } from "@/lib/order-rules"
import { OrderStatusChangeSchema } from "@/lib/validation/orders"

describe("parseAdminOrderQuery", () => {
  it("defaults to every order, page 1, 20 per page", () => {
    expect(parseAdminOrderQuery({})).toEqual({ status: undefined, q: undefined, page: 1, pageSize: 20 })
  })

  it("reads status, search, page and page size", () => {
    expect(parseAdminOrderQuery({ status: "shipped", q: " nc-1001 ", page: "3", pageSize: "50" })).toEqual({
      status: "shipped",
      q: "nc-1001",
      page: 3,
      pageSize: 50,
    })
  })

  it("drops only the params that don't validate", () => {
    expect(parseAdminOrderQuery({ status: "lost", q: "ada@example.com", page: "0", pageSize: "1000" })).toEqual({
      status: undefined,
      q: "ada@example.com",
      page: 1,
      pageSize: 20,
    })
    expect(parseAdminOrderQuery({ status: "pending", page: "2.5", q: "x".repeat(101) })).toEqual({
      status: "pending",
      q: undefined,
      page: 1,
      pageSize: 20,
    })
  })

  it("takes the first of repeated params and treats empty ones as unset", () => {
    expect(parseAdminOrderQuery({ status: ["cancelled", "pending"], q: "", page: ["2", "9"] })).toEqual({
      status: "cancelled",
      q: undefined,
      page: 2,
      pageSize: 20,
    })
  })
})

describe("adminOrdersHref", () => {
  it("is the bare list for the defaults", () => {
    expect(adminOrdersHref()).toBe("/admin/orders")
    expect(adminOrdersHref({ page: 1, pageSize: 20, q: "", status: undefined })).toBe("/admin/orders")
  })

  it("puts set filters in a stable order and encodes the search", () => {
    expect(adminOrdersHref({ page: 2, q: "ada+1@example.com", status: "processing", pageSize: 50 })).toBe(
      "/admin/orders?status=processing&q=ada%2B1%40example.com&pageSize=50&page=2",
    )
  })

  it("round-trips through parseAdminOrderQuery", () => {
    const query = { status: "rejected" as const, q: "NC-10", page: 4, pageSize: 10 }
    const params = Object.fromEntries(new URL(adminOrdersHref(query), "http://x").searchParams)
    expect(parseAdminOrderQuery(params)).toEqual(query)
  })
})

describe("generateTrackingNumber", () => {
  it("is NC1Z and 12 capital letters or digits", () => {
    for (let i = 0; i < 50; i++) expect(generateTrackingNumber()).toMatch(/^NC1Z[A-Z0-9]{12}$/)
  })

  it("is accepted by the status change schema for shipping", () => {
    const trackingNumber = generateTrackingNumber()
    expect(OrderStatusChangeSchema.parse({ status: "shipped", trackingNumber }).trackingNumber).toBe(trackingNumber)
  })

  it("draws every character from the random source, staying in range at both ends", () => {
    expect(generateTrackingNumber(() => 0)).toBe(`${TRACKING_PREFIX}AAAAAAAAAAAA`)
    expect(generateTrackingNumber(() => 0.999999)).toBe(`${TRACKING_PREFIX}999999999999`)
  })

  it("varies between calls", () => {
    const numbers = new Set(Array.from({ length: 20 }, () => generateTrackingNumber()))
    expect(numbers.size).toBe(20)
  })
})

describe("STATUS_ACTION_LABELS", () => {
  it("labels a button for every status", () => {
    expect(Object.keys(STATUS_ACTION_LABELS).sort()).toEqual([...ORDER_STATUSES].sort())
    expect(STATUS_ACTION_LABELS.shipped).toBe("Mark as shipped")
    expect(STATUS_ACTION_LABELS.rejected).toBe("Reject order")
  })
})
