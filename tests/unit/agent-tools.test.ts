import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderDetail, OrderSummary, Page } from "@/lib/orders"

import { makeEvent, makeOrderDetail, makeOrderSummary } from "./fixtures/orders"

vi.mock("server-only", () => ({}))

const listOrdersForUser = vi.fn<(userId: string, options: { page?: number; pageSize?: number }) => Promise<Page<OrderSummary>>>()
const getOrderForUser = vi.fn<(userId: string, number: string) => Promise<OrderDetail | null>>()
vi.mock("@/lib/orders", () => ({ listOrdersForUser, getOrderForUser }))

const { AGENT_ORDERS_PAGE_SIZE, getMyOrder, listMyOrders } = await import("@/lib/agent-tools")

beforeEach(() => {
  listOrdersForUser.mockReset()
  getOrderForUser.mockReset()
})

describe("listMyOrders", () => {
  it("reads the user's own orders, a page of 10, as short summaries", async () => {
    listOrdersForUser.mockResolvedValue({
      items: [
        makeOrderSummary({ number: "NC-10002", status: "shipped", itemCount: 2, totalCents: 12345, createdAt: new Date("2026-10-01T09:00:00Z") }),
      ],
      page: 2,
      pageSize: 10,
      total: 11,
      pageCount: 2,
    })

    const result = await listMyOrders("user-1", 2)

    expect(listOrdersForUser).toHaveBeenCalledWith("user-1", { page: 2, pageSize: AGENT_ORDERS_PAGE_SIZE })
    expect(result).toEqual({
      orders: [{ number: "NC-10002", status: "Shipped", placedAt: "2026-10-01T09:00:00.000Z", items: 2, total: "$123.45" }],
      page: 2,
      pageCount: 2,
      totalOrders: 11,
    })
  })

  it("returns an empty list for a user without orders", async () => {
    listOrdersForUser.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0, pageCount: 0 })
    expect(await listMyOrders("user-1")).toEqual({ orders: [], page: 1, pageCount: 0, totalOrders: 0 })
    expect(listOrdersForUser).toHaveBeenCalledWith("user-1", { page: 1, pageSize: 10 })
  })
})

describe("getMyOrder", () => {
  it("returns the order without the street, phone, email or ids", async () => {
    getOrderForUser.mockResolvedValue(
      makeOrderDetail({
        number: "NC-10005",
        status: "shipped",
        discountCode: "SAVE15",
        discountCents: 1500,
        trackingNumber: "NC1Z12345",
        events: [makeEvent("pending", "2026-09-20T10:00:00Z"), makeEvent("shipped", "2026-09-22T08:00:00Z", "Left the warehouse")],
      }),
    )

    const order = await getMyOrder("user-1", "nc-10005")

    expect(getOrderForUser).toHaveBeenCalledWith("user-1", "nc-10005")
    expect(order).toMatchObject({
      number: "NC-10005",
      status: "Shipped",
      items: 3,
      total: "$55.98",
      lines: [
        { product: "Aria ANC Wireless Headphones", brand: "Halden", quantity: 1, lineTotal: "$19.99" },
        { product: "Canvas Tote", brand: "Fieldnote", quantity: 2, lineTotal: "$30.00" },
      ],
      subtotal: "$49.99",
      discount: "SAVE15 (−$15.00)",
      shipping: "$5.99",
      shippingMethod: "Standard",
      paymentMethod: "Digital wallets",
      trackingNumber: "NC1Z12345",
      shipTo: "London, GB",
      history: [
        { status: "Pending", at: "2026-09-20T10:00:00.000Z", note: null },
        { status: "Shipped", at: "2026-09-22T08:00:00.000Z", note: "Left the warehouse" },
      ],
    })
    const text = JSON.stringify(order)
    for (const secret of ["Analytical Row", "+44", "ada@example.com", "user-1", "item-1", "EC1A"]) {
      expect(text).not.toContain(secret)
    }
  })

  it("says Free for free shipping and has no discount without a code", async () => {
    getOrderForUser.mockResolvedValue(makeOrderDetail({ shippingCents: 0 }))
    expect(await getMyOrder("user-1", "NC-1")).toMatchObject({ shipping: "Free", discount: null })
  })

  it("returns null for an order that isn't the user's", async () => {
    getOrderForUser.mockResolvedValue(null)
    expect(await getMyOrder("user-1", "NC-99999")).toBeNull()
  })
})
