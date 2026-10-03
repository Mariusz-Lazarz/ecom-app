import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { AdminOrderSummary, OrderStats } from "@/lib/orders"

import { makeOrderSummary } from "./fixtures/orders"

const pathname = { current: "/admin" }
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }))

const { OrderStatCards } = await import("@/components/admin/order-stats")
const { OrdersAwaitingAction } = await import("@/components/admin/orders-awaiting-action")
const { OrderFilters } = await import("@/components/admin/order-filters")
const { AdminOrderTable } = await import("@/components/admin/admin-order-table")
const { AdminNav } = await import("@/components/admin/admin-nav")

const stats: OrderStats = {
  counts: { pending: 3, processing: 2, shipped: 1, delivered: 4, cancelled: 1, rejected: 1 },
  totalOrders: 12,
  revenueCents: 1234567,
  currency: "USD",
}

const adminOrder = (overrides: Partial<AdminOrderSummary> = {}): AdminOrderSummary => ({
  ...makeOrderSummary(),
  customer: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
  ...overrides,
})

const hrefOf = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href")

describe("OrderStatCards", () => {
  it("shows total orders and revenue, linking the total to the full list", () => {
    render(<OrderStatCards stats={stats} />)

    expect(screen.getByTestId("stat-total-orders")).toHaveTextContent("12")
    expect(screen.getByTestId("stat-revenue")).toHaveTextContent("$12,345.67")
    expect(screen.getByText("Excludes cancelled and rejected orders")).toBeInTheDocument()
    expect(hrefOf("All orders: 12")).toBe("/admin/orders")
  })

  it("has one card per status with its count, linking to the list filtered by it", () => {
    render(<OrderStatCards stats={stats} />)

    const cards = within(screen.getByRole("list", { name: "Orders by status" })).getAllByRole("link")
    expect(cards.map((card) => [card.getAttribute("aria-label"), card.getAttribute("href")])).toEqual([
      ["Pending: 3", "/admin/orders?status=pending"],
      ["Processing: 2", "/admin/orders?status=processing"],
      ["Shipped: 1", "/admin/orders?status=shipped"],
      ["Delivered: 4", "/admin/orders?status=delivered"],
      ["Cancelled: 1", "/admin/orders?status=cancelled"],
      ["Rejected: 1", "/admin/orders?status=rejected"],
    ])
    expect(cards[3]).toHaveTextContent("Delivered4")
  })

  it("shows zeros for an empty shop", () => {
    render(
      <OrderStatCards
        stats={{
          counts: { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0, rejected: 0 },
          totalOrders: 0,
          revenueCents: 0,
          currency: "USD",
        }}
      />,
    )

    expect(screen.getByTestId("stat-total-orders")).toHaveTextContent("0")
    expect(screen.getByTestId("stat-revenue")).toHaveTextContent("$0.00")
    expect(hrefOf("Pending: 0")).toBe("/admin/orders?status=pending")
  })

  it("groups large counts", () => {
    render(<OrderStatCards stats={{ ...stats, totalOrders: 12345 }} />)

    expect(screen.getByTestId("stat-total-orders")).toHaveTextContent("12,345")
  })
})

describe("OrdersAwaitingAction", () => {
  it("lists each order with its customer, status and total, linking to its admin page", () => {
    render(
      <OrdersAwaitingAction
        orders={[
          adminOrder({ number: "NC-1001", status: "pending", totalCents: 4599 }),
          adminOrder({
            number: "NC-1002",
            status: "processing",
            customer: { id: "u2", name: "Alan Turing", email: "alan@example.com" },
          }),
        ]}
      />,
    )

    const rows = within(screen.getByRole("list", { name: "Orders needing attention" })).getAllByRole("link")
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/admin/orders/NC-1001", "/admin/orders/NC-1002"])
    expect(rows[0]).toHaveTextContent("NC-1001")
    expect(rows[0]).toHaveTextContent("Pending")
    expect(rows[0]).toHaveTextContent("Ada Lovelace · placed Sep 20, 2026")
    expect(rows[0]).toHaveTextContent("$45.99")
    expect(within(rows[1]).getByText("Processing")).toHaveAttribute("data-status", "processing")
    expect(rows[1]).toHaveTextContent("Alan Turing")
  })

  it("says nothing is waiting when the list is empty", () => {
    render(<OrdersAwaitingAction orders={[]} />)

    expect(screen.getByText(/Nothing is waiting/)).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })
})

describe("OrderFilters", () => {
  const query = { status: undefined, q: undefined, page: 1, pageSize: 20 }

  it("has All plus one chip per status with counts, marking the current one", () => {
    render(<OrderFilters query={{ ...query, status: "shipped" }} counts={stats.counts} totalOrders={12} />)

    const chips = within(screen.getByRole("navigation", { name: "Filter by status" })).getAllByRole("link")
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "All12",
      "Pending3",
      "Processing2",
      "Shipped1",
      "Delivered4",
      "Cancelled1",
      "Rejected1",
    ])
    expect(chips.filter((chip) => chip.getAttribute("aria-current") === "page")).toEqual([chips[3]])
  })

  it("keeps the search but not the page in chip links", () => {
    render(
      <OrderFilters query={{ ...query, status: "pending", q: "ada@example.com", page: 3 }} counts={stats.counts} totalOrders={12} />,
    )

    const chips = within(screen.getByRole("navigation", { name: "Filter by status" })).getAllByRole("link")
    expect(chips[0]).toHaveAttribute("href", "/admin/orders?q=ada%40example.com")
    expect(chips[5]).toHaveAttribute("href", "/admin/orders?status=cancelled&q=ada%40example.com")
    expect(chips[0]).not.toHaveAttribute("aria-current")
  })

  it("links chips without a search to the plain filtered list", () => {
    render(<OrderFilters query={query} counts={stats.counts} totalOrders={12} />)

    const chips = within(screen.getByRole("navigation", { name: "Filter by status" })).getAllByRole("link")
    expect(chips[0]).toHaveAttribute("href", "/admin/orders")
    expect(chips[0]).toHaveAttribute("aria-current", "page")
    expect(chips[1]).toHaveAttribute("href", "/admin/orders?status=pending")
  })

  it("searches with a GET form that keeps the status filter", () => {
    render(<OrderFilters query={{ ...query, status: "processing", q: "NC-10" }} counts={stats.counts} totalOrders={12} />)

    const form = screen.getByRole("search", { name: "Search orders" })
    expect(form).toHaveAttribute("action", "/admin/orders")
    expect(form.getAttribute("method") ?? "get").toMatch(/^get$/i)
    expect(within(form).getByRole("searchbox", { name: "Order number or email" })).toHaveValue("NC-10")
    expect(within(form).getByRole("searchbox")).toHaveAttribute("name", "q")
    const hidden = [...form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((i) => [i.name, i.value])
    expect(hidden).toEqual([["status", "processing"]])
    expect(within(form).getByRole("link", { name: "Clear" })).toHaveAttribute("href", "/admin/orders?status=processing")
  })

  it("has no hidden fields or Clear link without filters", () => {
    render(<OrderFilters query={query} counts={stats.counts} totalOrders={12} />)

    const form = screen.getByRole("search")
    expect(form.querySelectorAll('input[type="hidden"]')).toHaveLength(0)
    expect(within(form).queryByRole("link", { name: "Clear" })).not.toBeInTheDocument()
  })
})

describe("AdminOrderTable", () => {
  it("shows number, date, customer, items, total and status per row, linking to the order", () => {
    render(
      <AdminOrderTable
        orders={[adminOrder({ number: "NC-10042", itemCount: 3, totalCents: 15900, status: "shipped" })]}
      />,
    )

    const table = screen.getByRole("table", { name: "Orders" })
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Order",
      "Date",
      "Customer",
      "Items",
      "Total",
      "Status",
    ])
    const cells = within(within(table).getAllByRole("row")[1]).getAllByRole("cell")
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "NC-10042",
      "Sep 20, 2026",
      "Ada Lovelaceada@example.com",
      "3",
      "$159.00",
      "Shipped",
    ])
    expect(within(table).getByRole("link", { name: "NC-10042" })).toHaveAttribute("href", "/admin/orders/NC-10042")
  })
})

describe("AdminNav", () => {
  it.each([
    ["/admin", "Dashboard"],
    ["/admin/orders", "Orders"],
    ["/admin/orders/NC-1001", "Orders"],
    ["/admin/products", "Products"],
    ["/admin/products/new", "Products"],
    ["/admin/reviews", "Reviews"],
    ["/admin/discounts", "Discounts"],
    ["/admin/discounts/new", "Discounts"],
  ])("on %s marks %s as the current section", (path, current) => {
    pathname.current = path
    render(<AdminNav />)

    const links = within(screen.getByRole("navigation", { name: "Admin" })).getAllByRole("link")
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Dashboard", "/admin"],
      ["Orders", "/admin/orders"],
      ["Products", "/admin/products"],
      ["Reviews", "/admin/reviews"],
      ["Discounts", "/admin/discounts"],
    ])
    expect(links.filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.textContent)).toEqual([current])
  })
})
