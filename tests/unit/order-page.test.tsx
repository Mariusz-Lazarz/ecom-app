import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderDetail } from "@/lib/orders"

import { makeEvent, makeOrderDetail } from "./fixtures/orders"

const requireUser = vi.fn()
const getOrderForUser = vi.fn<(userId: string, number: string) => Promise<OrderDetail | null>>()
const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
})

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth-guards", () => ({ requireUser: (path: string) => requireUser(path) }))
vi.mock("@/lib/orders", () => ({ getOrderForUser: (u: string, n: string) => getOrderForUser(u, n) }))
vi.mock("next/navigation", () => ({ notFound: () => notFound() }))
vi.mock("@/app/actions/orders", () => ({ cancelOrder: vi.fn() }))
// SiteHeader is an async Server Component (reads the session) and has its own tests.
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header /> }))

const { default: OrderPage } = await import("@/app/orders/[number]/page")

async function renderOrder(order: OrderDetail | null, number = order?.number ?? "NC-99999") {
  getOrderForUser.mockResolvedValue(order)
  const ui = await OrderPage({ params: Promise.resolve({ number }), searchParams: Promise.resolve({}) })
  return render(ui)
}

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue({ user: { id: "user-1", name: "Ada Lovelace" } })
  getOrderForUser.mockReset()
  notFound.mockClear()
})

describe("Order page", () => {
  it("asks signed-out visitors to log in and come back to this order", async () => {
    requireUser.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" }))

    await expect(renderOrder(null, "NC-10001")).rejects.toMatchObject({ message: "NEXT_REDIRECT" })
    expect(requireUser).toHaveBeenCalledExactlyOnceWith("/orders/NC-10001")
    expect(getOrderForUser).not.toHaveBeenCalled()
  })

  it("is a 404 for an order that isn't the user's (or doesn't exist)", async () => {
    await expect(renderOrder(null, "NC-10001")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
    expect(getOrderForUser).toHaveBeenCalledExactlyOnceWith("user-1", "NC-10001")
  })

  it("shows the number, status, items, address, shipping, payment and totals", async () => {
    await renderOrder(makeOrderDetail({ number: "NC-10007" }))

    expect(screen.getByRole("heading", { level: 1, name: "Order NC-10007" })).toBeInTheDocument()
    expect(screen.getAllByText("Pending")[0]).toHaveAttribute("data-status", "pending")

    const items = screen.getByRole("list", { name: "Items" })
    const links = within(items).getAllByRole("link", { name: /Aria|Canvas Tote/ })
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/products/aria", "/products/tote"])
    expect(items).toHaveTextContent("1 × $19.99$29.99")
    expect(items).toHaveTextContent("2 × $15.00")

    const address = document.querySelector("address")!
    expect(address).toHaveTextContent("Ada Lovelace12 Analytical RowFlat 3EC1A 1BB LondonUnited Kingdom+44 20 7946 0958")
    expect(screen.getByText("Standard")).toBeInTheDocument()
    expect(screen.getByText("Digital wallets")).toBeInTheDocument()

    const totals = document.querySelector<HTMLElement>('dl[aria-label="Order totals"]')!
    expect(within(totals).getByText("Subtotal").nextElementSibling).toHaveTextContent("$49.99")
    expect(within(totals).getByText("You saved").nextElementSibling).toHaveTextContent("−$10.00")
    expect(within(totals).getByText("Shipping (Standard)").nextElementSibling).toHaveTextContent("$5.99")
    expect(within(totals).getByText("Total").nextElementSibling).toHaveTextContent("$55.98")
  })

  it("thanks the customer for an order placed moments ago", async () => {
    const now = new Date()
    await renderOrder(makeOrderDetail({ createdAt: now, events: [makeEvent("pending", now.toISOString())] }))

    expect(screen.getByRole("region", { name: "Order confirmation" })).toHaveTextContent("Thank you for your order!")
  })

  it("doesn't thank the customer again for an older order", async () => {
    await renderOrder(makeOrderDetail({ createdAt: new Date(Date.now() - 60 * 60 * 1000) }))
    expect(screen.queryByText("Thank you for your order!")).not.toBeInTheDocument()
  })

  it("offers to cancel only a pending order", async () => {
    await renderOrder(makeOrderDetail({ status: "pending" }))
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument()
  })

  it.each(["processing", "shipped", "delivered", "cancelled", "rejected"] as const)(
    "doesn't offer to cancel a %s order",
    async (status) => {
      await renderOrder(makeOrderDetail({ status }))
      expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument()
    },
  )

  it("shows the status history with labels, notes and the tracking number", async () => {
    await renderOrder(
      makeOrderDetail({
        status: "shipped",
        trackingNumber: "1Z999AA10123456784",
        events: [
          makeEvent("pending", "2026-09-01T09:00:00Z"),
          makeEvent("processing", "2026-09-02T09:00:00Z", "Packed with care."),
          makeEvent("shipped", "2026-09-03T09:00:00Z"),
        ],
      }),
    )

    const steps = within(screen.getByRole("list", { name: "Order history" })).getAllByRole("listitem")
    expect(steps.map((step) => step.getAttribute("data-status"))).toEqual(["pending", "processing", "shipped"])
    expect(steps[0]).toHaveTextContent("Pending")
    expect(steps[0]).toHaveTextContent("Sep 1, 2026")
    expect(steps[0]).toHaveTextContent("Order placed and paid.")
    expect(steps[1]).toHaveTextContent("Packed with care.")
    expect(steps[2]).toHaveTextContent("Shipped")
    expect(steps[2]).toHaveTextContent("Tracking number: 1Z999AA10123456784")
    expect(screen.getAllByText("1Z999AA10123456784")).toHaveLength(2)
  })

  it("shows a cancellation with its note", async () => {
    await renderOrder(
      makeOrderDetail({
        status: "cancelled",
        events: [
          makeEvent("pending", "2026-09-01T09:00:00Z"),
          makeEvent("cancelled", "2026-09-01T10:00:00Z", "Cancelled by the customer."),
        ],
      }),
    )

    const steps = within(screen.getByRole("list", { name: "Order history" })).getAllByRole("listitem")
    expect(steps[1]).toHaveTextContent("Cancelled")
    expect(steps[1]).toHaveTextContent("Cancelled by the customer.")
    expect(screen.queryByText(/Tracking number/)).not.toBeInTheDocument()
  })
})
