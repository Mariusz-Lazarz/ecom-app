import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AdminOrderSummary, OrderDetail, OrderListOptions, OrderStats, Page } from "@/lib/orders"

import { makeEvent, makeOrderDetail, makeOrderSummary } from "./fixtures/orders"

const requireAdmin = vi.fn()
const getOrderStats = vi.fn<() => Promise<OrderStats>>()
const listOrders = vi.fn<(options: OrderListOptions) => Promise<Page<AdminOrderSummary>>>()
const listOrdersAwaitingAction = vi.fn<(limit: number) => Promise<AdminOrderSummary[]>>()
const getOrder = vi.fn<(number: string) => Promise<OrderDetail | null>>()
const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
})

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth-guards", () => ({ requireAdmin: (returnTo?: string) => requireAdmin(returnTo) }))
vi.mock("@/lib/orders", () => ({
  getOrderStats: () => getOrderStats(),
  listOrders: (options: OrderListOptions) => listOrders(options),
  listOrdersAwaitingAction: (limit: number) => listOrdersAwaitingAction(limit),
  getOrder: (number: string) => getOrder(number),
}))
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  usePathname: () => "/admin",
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock("@/app/actions/orders", () => ({ changeOrderStatus: vi.fn() }))

const { default: DashboardPage } = await import("@/app/admin/page")
const { default: OrdersPage } = await import("@/app/admin/orders/page")
const { default: OrderPage } = await import("@/app/admin/orders/[number]/page")

const stats: OrderStats = {
  counts: { pending: 2, processing: 1, shipped: 0, delivered: 3, cancelled: 1, rejected: 0 },
  totalOrders: 7,
  revenueCents: 25000,
  currency: "USD",
}

const adminOrder = (overrides: Partial<AdminOrderSummary> = {}): AdminOrderSummary => ({
  ...makeOrderSummary(),
  customer: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
  ...overrides,
})

const page = (items: AdminOrderSummary[], extra: Partial<Page<AdminOrderSummary>> = {}): Page<AdminOrderSummary> => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  pageCount: items.length ? 1 : 0,
  ...extra,
})

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }

const renderOrders = async (searchParams: Record<string, string | string[]> = {}) =>
  render(await OrdersPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))
const renderOrder = async (number: string) =>
  render(await OrderPage({ params: Promise.resolve({ number }), searchParams: Promise.resolve({}) }))

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { id: "admin-1", role: "admin" } })
  getOrderStats.mockReset().mockResolvedValue(stats)
  listOrders.mockReset().mockResolvedValue(page([]))
  listOrdersAwaitingAction.mockReset().mockResolvedValue([])
  getOrder.mockReset().mockResolvedValue(null)
  notFound.mockClear()
})

describe("admin pages guard access", () => {
  const forbid = () => requireAdmin.mockImplementation(async () => notFound())

  it("the dashboard 404s for non-admins before reading anything", async () => {
    forbid()

    await expect(DashboardPage()).rejects.toMatchObject(NOT_FOUND)
    expect(requireAdmin).toHaveBeenCalledExactlyOnceWith("/admin")
    expect(getOrderStats).not.toHaveBeenCalled()
    expect(listOrdersAwaitingAction).not.toHaveBeenCalled()
  })

  it("the order list 404s for non-admins before reading anything", async () => {
    forbid()

    await expect(renderOrders({ status: "pending" })).rejects.toMatchObject(NOT_FOUND)
    expect(requireAdmin).toHaveBeenCalledExactlyOnceWith("/admin/orders")
    expect(listOrders).not.toHaveBeenCalled()
    expect(getOrderStats).not.toHaveBeenCalled()
  })

  it("the order page 404s for non-admins before reading the order", async () => {
    forbid()

    await expect(renderOrder("NC-1001")).rejects.toMatchObject(NOT_FOUND)
    expect(requireAdmin).toHaveBeenCalledExactlyOnceWith("/admin/orders/NC-1001")
    expect(getOrder).not.toHaveBeenCalled()
  })

  it("passes a return path so signed-out admins come back after the login", async () => {
    requireAdmin.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" }))

    await expect(renderOrder("NC 1/2")).rejects.toMatchObject({ message: "NEXT_REDIRECT" })
    expect(requireAdmin).toHaveBeenCalledExactlyOnceWith("/admin/orders/NC%201%2F2")
  })
})

describe("admin dashboard", () => {
  it("shows the stats and the oldest orders needing attention", async () => {
    listOrdersAwaitingAction.mockResolvedValue([adminOrder({ number: "NC-1003", status: "processing" })])

    render(await DashboardPage())

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument()
    expect(screen.getByTestId("stat-total-orders")).toHaveTextContent("7")
    expect(screen.getByTestId("stat-revenue")).toHaveTextContent("$250.00")
    expect(listOrdersAwaitingAction).toHaveBeenCalledExactlyOnceWith(5)
    const attention = screen.getByRole("list", { name: "Orders needing attention" })
    expect(within(attention).getByRole("link")).toHaveAttribute("href", "/admin/orders/NC-1003")
    expect(screen.getByRole("link", { name: /All orders$/ })).toHaveAttribute("href", "/admin/orders")
  })
})

describe("admin order list", () => {
  it("lists the orders with the parsed filters and the status counts", async () => {
    listOrders.mockResolvedValue(page([adminOrder({ number: "NC-1005", status: "pending" })]))

    await renderOrders({ status: "pending", q: "ada", page: "1" })

    expect(listOrders).toHaveBeenCalledExactlyOnceWith({ status: "pending", q: "ada", page: 1, pageSize: 20 })
    expect(screen.getByRole("heading", { level: 1, name: "Orders" })).toBeInTheDocument()
    expect(screen.getByText("1 order · Pending matching “ada”")).toBeInTheDocument()
    expect(within(screen.getByRole("table")).getByRole("link", { name: "NC-1005" })).toHaveAttribute(
      "href",
      "/admin/orders/NC-1005",
    )
    expect(screen.getByRole("link", { name: /^All/ })).toHaveTextContent("All7")
  })

  it("falls back to defaults for invalid params", async () => {
    await renderOrders({ status: "lost", page: "-3", pageSize: "abc", q: "NC-1" })

    expect(listOrders).toHaveBeenCalledExactlyOnceWith({ status: undefined, q: "NC-1", page: 1, pageSize: 20 })
  })

  it("shows an empty state with a way to clear the filters", async () => {
    await renderOrders({ status: "shipped", q: "nobody" })

    expect(screen.getByText("No orders found")).toBeInTheDocument()
    expect(screen.getByText("No orders match these filters.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/admin/orders")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("shows an empty shop without a clear link", async () => {
    await renderOrders()

    expect(screen.getByText("When customers place orders, they'll show up here.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument()
  })

  it("links back to the first page from a page past the end", async () => {
    listOrders.mockResolvedValue(page([], { page: 9, total: 30, pageCount: 2 }))

    await renderOrders({ status: "delivered", page: "9" })

    expect(screen.getByText("There are only 2 pages of orders.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go to the first page" })).toHaveAttribute(
      "href",
      "/admin/orders?status=delivered",
    )
  })

  it("paginates, keeping the filters", async () => {
    listOrders.mockResolvedValue(
      page([adminOrder()], { page: 2, total: 45, pageCount: 3 }),
    )

    await renderOrders({ q: "ada", page: "2" })

    const nav = screen.getByRole("navigation", { name: "Pagination" })
    expect(within(nav).getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/admin/orders?q=ada")
    expect(within(nav).getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/admin/orders?q=ada&page=3")
    expect(within(nav).getByRole("link", { name: "Page 2" })).toHaveAttribute("aria-current", "page")
  })
})

describe("admin order page", () => {
  it("is a 404 for an unknown order", async () => {
    await expect(renderOrder("NC-404")).rejects.toMatchObject(NOT_FOUND)
    expect(getOrder).toHaveBeenCalledExactlyOnceWith("NC-404")
  })

  it("shows customer, address, shipping, payment, items, totals and the status actions", async () => {
    getOrder.mockResolvedValue(makeOrderDetail({ number: "NC-1007", status: "processing" }))

    await renderOrder("NC-1007")

    expect(screen.getByRole("heading", { level: 1, name: "Order NC-1007" })).toBeInTheDocument()
    expect(screen.getByText("ada@example.com")).toHaveAttribute("href", "mailto:ada@example.com")
    expect(screen.getByRole("link", { name: "Orders from this customer" })).toHaveAttribute(
      "href",
      "/admin/orders?q=ada%40example.com",
    )
    expect(document.querySelector("address")).toHaveTextContent("Ada Lovelace12 Analytical RowFlat 3EC1A 1BB London")
    expect(screen.getByText("Standard")).toBeInTheDocument()
    expect(screen.getByText("Digital wallets")).toBeInTheDocument()
    expect(within(screen.getByRole("list", { name: "Items" })).getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Mark as shipped",
      "Cancel order",
      "Reject order",
    ])
  })

  it("shows the full history with who made each change and their notes, and the tracking number", async () => {
    getOrder.mockResolvedValue(
      makeOrderDetail({
        status: "shipped",
        trackingNumber: "NC1ZABC123",
        events: [
          { ...makeEvent("pending", "2026-09-20T10:00:00Z"), actorRole: "customer" },
          makeEvent("processing", "2026-09-21T10:00:00Z", "Packing today"),
          makeEvent("shipped", "2026-09-22T10:00:00Z"),
        ],
      }),
    )

    await renderOrder("NC-1008")

    const steps = within(screen.getByRole("list", { name: "Order history" })).getAllByRole("listitem")
    expect(steps).toHaveLength(3)
    expect(steps[0]).toHaveTextContent("by Customer")
    expect(steps[0]).toHaveTextContent("Order placed and paid.")
    expect(steps[1]).toHaveTextContent("by Admin")
    expect(steps[1]).toHaveTextContent("Packing today")
    expect(steps[2]).toHaveTextContent("Tracking number: NC1ZABC123")
    // In the shipping card and on the shipped step.
    expect(screen.getAllByText("NC1ZABC123")).toHaveLength(2)
  })

  it("has no status buttons for a final order", async () => {
    getOrder.mockResolvedValue(makeOrderDetail({ status: "delivered" }))

    await renderOrder("NC-1009")

    expect(screen.getByText("No further actions: this order is final.")).toBeInTheDocument()
    expect(screen.queryAllByRole("button")).toEqual([])
  })
})
