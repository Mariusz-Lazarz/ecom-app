import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { OrderList } from "@/components/orders/order-list"
import type { OrderSummary, Page } from "@/lib/orders"

import { makeOrderSummary } from "./fixtures/orders"

const page = (items: OrderSummary[], overrides: Partial<Page<OrderSummary>> = {}): Page<OrderSummary> => ({
  items,
  page: 1,
  pageSize: 10,
  total: items.length,
  pageCount: items.length ? 1 : 0,
  ...overrides,
})

describe("OrderList", () => {
  it("shows the empty state with a link to the products when there are no orders", () => {
    render(<OrderList list={page([])} />)

    expect(screen.getByText("No orders yet")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Browse products" })).toHaveAttribute("href", "/products")
    expect(screen.queryByRole("list", { name: "Orders" })).not.toBeInTheDocument()
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument()
  })

  it("lists each order in the given order with number, date, status, item count and total, linking to it", () => {
    const newer = makeOrderSummary({
      number: "NC-10002",
      status: "shipped",
      itemCount: 1,
      totalCents: 1299,
      createdAt: new Date("2026-09-21T12:00:00Z"),
    })
    const older = makeOrderSummary({
      number: "NC-10001",
      status: "cancelled",
      itemCount: 3,
      totalCents: 15000,
      createdAt: new Date("2026-08-02T12:00:00Z"),
    })
    render(<OrderList list={page([newer, older])} />)

    const rows = within(screen.getByRole("list", { name: "Orders" })).getAllByRole("link")
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/orders/NC-10002", "/orders/NC-10001"])
    expect(rows[0]).toHaveTextContent("NC-10002")
    expect(rows[0]).toHaveTextContent("Sep 21, 2026 · 1 item")
    expect(within(rows[0]).getByText("Shipped")).toHaveAttribute("data-status", "shipped")
    expect(rows[0]).toHaveTextContent("$12.99")
    expect(rows[1]).toHaveTextContent("Aug 2, 2026 · 3 items")
    expect(within(rows[1]).getByText("Cancelled")).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent("$150.00")
  })

  it("doesn't paginate a single page", () => {
    render(<OrderList list={page([makeOrderSummary()])} />)
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument()
  })

  it("links the first page forward only", () => {
    render(<OrderList list={page([makeOrderSummary()], { page: 1, total: 25, pageCount: 3 })} />)

    const nav = screen.getByRole("navigation", { name: "Pagination" })
    expect(nav).toHaveTextContent("Page 1 of 3")
    expect(within(nav).queryByRole("link", { name: "Previous page" })).not.toBeInTheDocument()
    expect(within(nav).getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/account/orders?page=2")
  })

  it("links a middle page both ways, page 1 without a query", () => {
    render(<OrderList list={page([makeOrderSummary()], { page: 2, total: 25, pageCount: 3 })} />)

    const nav = screen.getByRole("navigation", { name: "Pagination" })
    expect(within(nav).getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/account/orders")
    expect(within(nav).getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/account/orders?page=3")
  })

  it("links the last page back only", () => {
    render(<OrderList list={page([makeOrderSummary()], { page: 3, total: 25, pageCount: 3 })} />)

    const nav = screen.getByRole("navigation", { name: "Pagination" })
    expect(within(nav).getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/account/orders?page=2")
    expect(within(nav).queryByRole("link", { name: "Next page" })).not.toBeInTheDocument()
  })

  it("offers the first page when the page is past the end", () => {
    render(<OrderList list={page([], { page: 9, total: 25, pageCount: 3 })} />)

    expect(screen.getByRole("link", { name: "Go to the first page" })).toHaveAttribute("href", "/account/orders")
    expect(screen.queryByText("No orders yet")).not.toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Pagination" })).toHaveTextContent("Page 3 of 3")
  })
})
