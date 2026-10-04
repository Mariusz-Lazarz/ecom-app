import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AdminProduct, AdminProductListOptions, AdminProductSummary } from "@/lib/admin-products"
import type { ContactMessage } from "@/lib/contact"
import type { AdminOrderSummary, OrderDetail, OrderListOptions, OrderStats, Page } from "@/lib/orders"
import type { AdminReview } from "@/lib/reviews"
import type { AdminReviewListQuery } from "@/lib/validation/reviews"

import { makeEvent, makeOrderDetail, makeOrderSummary } from "./fixtures/orders"

const requireAdmin = vi.fn()
const getOrderStats = vi.fn<() => Promise<OrderStats>>()
const listOrders = vi.fn<(options: OrderListOptions) => Promise<Page<AdminOrderSummary>>>()
const listOrdersAwaitingAction = vi.fn<(limit: number) => Promise<AdminOrderSummary[]>>()
const getOrder = vi.fn<(number: string) => Promise<OrderDetail | null>>()
const listLowStockProducts = vi.fn<(limit: number) => Promise<AdminProductSummary[]>>()
const listAdminProducts = vi.fn<(options: AdminProductListOptions) => Promise<Page<AdminProductSummary>>>()
const getAdminProduct = vi.fn<(id: string) => Promise<AdminProduct | null>>()
const listCategories = vi.fn()
const listLatestReviews = vi.fn<(limit: number) => Promise<AdminReview[]>>()
const listAdminReviews = vi.fn<(options: AdminReviewListQuery) => Promise<Page<AdminReview>>>()
const getReviewStatusCounts = vi.fn<() => Promise<{ published: number; hidden: number }>>()
const listNewContactMessages = vi.fn<(limit: number) => Promise<ContactMessage[]>>()
const countNewContactMessages = vi.fn<() => Promise<number>>()
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
vi.mock("@/lib/admin-products", () => ({
  listLowStockProducts: (limit: number) => listLowStockProducts(limit),
  listAdminProducts: (options: AdminProductListOptions) => listAdminProducts(options),
  getAdminProduct: (id: string) => getAdminProduct(id),
}))
vi.mock("@/lib/categories", () => ({ listCategories: () => listCategories() }))
vi.mock("@/lib/reviews", () => ({
  listLatestReviews: (limit: number) => listLatestReviews(limit),
  listAdminReviews: (options: AdminReviewListQuery) => listAdminReviews(options),
  getReviewStatusCounts: () => getReviewStatusCounts(),
}))
vi.mock("@/lib/contact", () => ({
  listNewContactMessages: (limit: number) => listNewContactMessages(limit),
  countNewContactMessages: () => countNewContactMessages(),
}))
vi.mock("@/app/actions/reviews", () => ({ setReviewStatus: vi.fn(), deleteReview: vi.fn() }))
vi.mock("@/app/actions/orders", () => ({ changeOrderStatus: vi.fn() }))
vi.mock("@/app/actions/admin-products", () => ({
  saveProduct: vi.fn(),
  deleteProduct: vi.fn(),
  uploadProductImage: vi.fn(),
}))

const { default: DashboardPage } = await import("@/app/admin/page")
const { default: OrdersPage } = await import("@/app/admin/orders/page")
const { default: OrderPage } = await import("@/app/admin/orders/[number]/page")
const { default: ProductsPage } = await import("@/app/admin/products/page")
const { default: NewProductPage } = await import("@/app/admin/products/new/page")
const { default: EditProductPage } = await import("@/app/admin/products/[id]/page")
const { default: ReviewsPage } = await import("@/app/admin/reviews/page")

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
const renderProducts = async (searchParams: Record<string, string | string[]> = {}) =>
  render(await ProductsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))
const renderEditProduct = async (id: string) =>
  render(await EditProductPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }))

const renderReviews = async (searchParams: Record<string, string | string[]> = {}) =>
  render(await ReviewsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))

const PRODUCT_ID = "5b0e7c1d-2a3f-4b5c-8d9e-0f1a2b3c4d5e"

const adminReview = (overrides: Partial<AdminReview> = {}): AdminReview => ({
  id: "r-1",
  rating: 4,
  title: "Sturdy mug",
  body: "Keeps coffee hot for ages.",
  status: "published",
  verified: true,
  createdAt: new Date("2026-09-21T10:00:00Z"),
  product: { id: PRODUCT_ID, name: "Trail Mug", slug: "trail-mug" },
  author: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
  ...overrides,
})
const categories = [
  { id: "11111111-1111-4111-8111-111111111111", slug: "audio", name: "Audio", icon: "headphones" },
  { id: "22222222-2222-4222-8222-222222222222", slug: "home-kitchen", name: "Home & Kitchen", icon: "home" },
]

const productSummary = (overrides: Partial<AdminProductSummary> = {}): AdminProductSummary => ({
  id: PRODUCT_ID,
  slug: "trail-mug",
  name: "Trail Mug",
  brand: "Halden",
  category: { slug: "home-kitchen", name: "Home & Kitchen" },
  priceCents: 1250,
  compareAtCents: null,
  currency: "USD",
  stock: 4,
  featured: false,
  badge: null,
  image: null,
  ...overrides,
})

const adminProduct: AdminProduct = {
  id: PRODUCT_ID,
  slug: "trail-mug",
  name: "Trail Mug",
  brand: "Halden",
  categoryId: categories[1].id,
  shortDescription: "Enamel mug.",
  description: "A sturdy enamel mug.",
  priceCents: 1250,
  compareAtCents: null,
  currency: "USD",
  stock: 4,
  rating: 4.5,
  reviewCount: 3,
  badge: null,
  featured: false,
  specs: [],
  images: [],
  orderLineCount: 2,
}

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { id: "admin-1", role: "admin" } })
  getOrderStats.mockReset().mockResolvedValue(stats)
  listOrders.mockReset().mockResolvedValue(page([]))
  listOrdersAwaitingAction.mockReset().mockResolvedValue([])
  getOrder.mockReset().mockResolvedValue(null)
  listLowStockProducts.mockReset().mockResolvedValue([])
  listAdminProducts.mockReset().mockResolvedValue(page([]) as unknown as Page<AdminProductSummary>)
  getAdminProduct.mockReset().mockResolvedValue(null)
  listCategories.mockReset().mockResolvedValue(categories)
  listLatestReviews.mockReset().mockResolvedValue([])
  listAdminReviews.mockReset().mockResolvedValue(page([]) as unknown as Page<AdminReview>)
  getReviewStatusCounts.mockReset().mockResolvedValue({ published: 0, hidden: 0 })
  listNewContactMessages.mockReset().mockResolvedValue([])
  countNewContactMessages.mockReset().mockResolvedValue(0)
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
    expect(listLowStockProducts).not.toHaveBeenCalled()
    expect(listLatestReviews).not.toHaveBeenCalled()
    expect(listNewContactMessages).not.toHaveBeenCalled()
    expect(countNewContactMessages).not.toHaveBeenCalled()
  })

  it("the review list 404s for non-admins before reading anything", async () => {
    forbid()

    await expect(renderReviews({ status: "hidden" })).rejects.toMatchObject(NOT_FOUND)
    expect(requireAdmin).toHaveBeenCalledExactlyOnceWith("/admin/reviews")
    expect(listAdminReviews).not.toHaveBeenCalled()
    expect(getReviewStatusCounts).not.toHaveBeenCalled()
  })

  it("the product pages 404 for non-admins before reading anything", async () => {
    forbid()

    await expect(renderProducts({ stock: "low" })).rejects.toMatchObject(NOT_FOUND)
    await expect(NewProductPage()).rejects.toMatchObject(NOT_FOUND)
    await expect(renderEditProduct(PRODUCT_ID)).rejects.toMatchObject(NOT_FOUND)
    expect(requireAdmin.mock.calls).toEqual([
      ["/admin/products"],
      ["/admin/products/new"],
      [`/admin/products/${PRODUCT_ID}`],
    ])
    expect(listAdminProducts).not.toHaveBeenCalled()
    expect(getAdminProduct).not.toHaveBeenCalled()
    expect(listCategories).not.toHaveBeenCalled()
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
  it("lists the newest unread messages with the unread count", async () => {
    countNewContactMessages.mockResolvedValue(7)
    listNewContactMessages.mockResolvedValue([
      {
        id: "0b0c4d4e-1111-4222-8333-444455556666",
        name: "Ada Lovelace",
        email: "ada@example.com",
        orderNumber: null,
        topic: "returns",
        message: "Can I return the mug?",
        status: "new",
        userId: null,
        createdAt: new Date("2026-10-01T10:00:00Z"),
        updatedAt: new Date("2026-10-01T10:00:00Z"),
      },
    ])

    render(await DashboardPage())

    expect(listNewContactMessages).toHaveBeenCalledExactlyOnceWith(5)
    expect(screen.getByText("7 unread messages from the contact form.")).toBeInTheDocument()
    const list = screen.getByRole("list", { name: "New messages" })
    expect(within(list).getByRole("link", { name: "Ada Lovelace · Returns & refunds" })).toHaveAttribute(
      "href",
      "/admin/messages/0b0c4d4e-1111-4222-8333-444455556666",
    )
    expect(within(list).getByText("Can I return the mug?")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /All messages$/ })).toHaveAttribute("href", "/admin/messages")
  })

  it("says so when every message has been read", async () => {
    render(await DashboardPage())

    expect(screen.getByText("Every contact message has been read.")).toBeInTheDocument()
    expect(screen.getByText("No unread messages. Nice work!")).toBeInTheDocument()
  })

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

  it("lists the five lowest-stock products with links to edit them", async () => {
    listLowStockProducts.mockResolvedValue([
      productSummary({ id: "p-out", name: "Sold Out Mug", stock: 0 }),
      productSummary({ id: "p-low", name: "Almost Gone Mug", stock: 3 }),
    ])

    render(await DashboardPage())

    expect(listLowStockProducts).toHaveBeenCalledExactlyOnceWith(5)
    const items = within(screen.getByRole("list", { name: "Low stock products" })).getAllByRole("link")
    expect(items.map((item) => [item.getAttribute("href"), item.textContent])).toEqual([
      ["/admin/products/p-out", "Sold Out MugHalden · Home & Kitchen0Out"],
      ["/admin/products/p-low", "Almost Gone MugHalden · Home & Kitchen3Low"],
    ])
    expect(screen.getByRole("link", { name: /All low stock$/ })).toHaveAttribute("href", "/admin/products?stock=low")
  })

  it("says so when no product is low on stock", async () => {
    render(await DashboardPage())

    expect(screen.getByText("Every product is well stocked.")).toBeInTheDocument()
  })

  it("lists the five latest reviews with their product, author and status", async () => {
    listLatestReviews.mockResolvedValue([
      adminReview({ id: "r-2", title: "Spam", status: "hidden", rating: 1 }),
      adminReview(),
    ])

    render(await DashboardPage())

    expect(listLatestReviews).toHaveBeenCalledExactlyOnceWith(5)
    const rows = within(screen.getByRole("list", { name: "Latest reviews" })).getAllByRole("listitem")
    expect(rows.map((row) => row.textContent)).toEqual([
      "SpamTrail Mug · Ada LovelaceHidden",
      "Sturdy mugTrail Mug · Ada LovelacePublished",
    ])
    expect(within(rows[1]).getByRole("img", { name: "4 out of 5 stars" })).toBeInTheDocument()
    expect(within(rows[1]).getByRole("link", { name: "Trail Mug" })).toHaveAttribute("href", "/products/trail-mug#reviews")
    expect(screen.getByRole("link", { name: /All reviews$/ })).toHaveAttribute("href", "/admin/reviews")
  })

  it("says so when there are no reviews yet", async () => {
    render(await DashboardPage())

    expect(screen.getByText("No reviews yet.")).toBeInTheDocument()
  })
})

describe("admin review list", () => {
  it("lists the reviews with the parsed filters, status counts and moderation buttons", async () => {
    listAdminReviews.mockResolvedValue({
      items: [adminReview(), adminReview({ id: "r-2", title: "Spam", status: "hidden", verified: false })],
      page: 1,
      pageSize: 20,
      total: 2,
      pageCount: 1,
    })
    getReviewStatusCounts.mockResolvedValue({ published: 7, hidden: 2 })

    await renderReviews({ status: "hidden", rating: "4", q: " mug " })

    expect(listAdminReviews).toHaveBeenCalledExactlyOnceWith({
      status: "hidden",
      rating: 4,
      q: "mug",
      page: 1,
      pageSize: 20,
    })
    expect(screen.getByText("2 reviews · hidden · 4 stars matching “mug”")).toBeInTheDocument()
    const chips = within(screen.getByRole("navigation", { name: "Filter by status" })).getAllByRole("link")
    expect(chips.map((chip) => [chip.textContent, chip.getAttribute("href")])).toEqual([
      ["All9", "/admin/reviews?rating=4&q=mug"],
      ["Published7", "/admin/reviews?status=published&rating=4&q=mug"],
      ["Hidden2", "/admin/reviews?status=hidden&rating=4&q=mug"],
    ])
    const rows = within(screen.getByRole("table", { name: "Reviews" })).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("Sturdy mug")
    expect(within(rows[0]).getByLabelText("Verified purchase")).toBeInTheDocument()
    expect(within(rows[0]).getByRole("button", { name: "Hide review “Sturdy mug” by Ada Lovelace" })).toBeInTheDocument()
    expect(within(rows[1]).queryByLabelText("Verified purchase")).not.toBeInTheDocument()
    expect(within(rows[1]).getByRole("button", { name: "Unhide review “Spam” by Ada Lovelace" })).toBeInTheDocument()
    expect(within(rows[1]).getByRole("button", { name: "Delete review “Spam” by Ada Lovelace" })).toBeInTheDocument()
  })

  it("falls back to defaults for invalid params", async () => {
    await renderReviews({ status: "deleted", rating: "6", page: "0" })

    expect(listAdminReviews).toHaveBeenCalledExactlyOnceWith({
      status: undefined,
      rating: undefined,
      q: undefined,
      page: 1,
      pageSize: 20,
    })
  })

  it("shows an empty state with a way to clear the filters", async () => {
    await renderReviews({ rating: "1" })

    expect(screen.getByText("No reviews match these filters.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/admin/reviews")
  })
})

describe("admin product list", () => {
  it("lists the products with the parsed filters, stock badges and edit links", async () => {
    listAdminProducts.mockResolvedValue({
      items: [
        productSummary({ stock: 0, featured: true, badge: "New", compareAtCents: 1500 }),
        productSummary({ id: "p-2", name: "Desk Lamp", stock: 25 }),
      ],
      page: 1,
      pageSize: 20,
      total: 2,
      pageCount: 1,
    })

    await renderProducts({ q: " mug ", category: "home-kitchen", stock: "low" })

    expect(listAdminProducts).toHaveBeenCalledExactlyOnceWith({
      q: "mug",
      category: "home-kitchen",
      stock: "low",
      page: 1,
      pageSize: 20,
    })
    expect(screen.getByText("2 products in Home & Kitchen · low stock matching “mug”")).toBeInTheDocument()
    const rows = within(screen.getByRole("table", { name: "Products" })).getAllByRole("row").slice(1)
    expect(rows.map((row) => within(row).getAllByRole("cell").slice(1).map((cell) => cell.textContent))).toEqual([
      ["Trail MugHalden", "Home & Kitchen", "$12.50Was $15.00", "0Out", "Yes", "New"],
      ["Desk LampHalden", "Home & Kitchen", "$12.50", "25", "No", "—"],
    ])
    expect(screen.getByRole("link", { name: "Trail Mug" })).toHaveAttribute("href", `/admin/products/${PRODUCT_ID}`)
    expect(screen.getByRole("link", { name: "New product" })).toHaveAttribute("href", "/admin/products/new")
    expect(screen.getByRole("link", { name: "Low stock" })).toHaveAttribute(
      "href",
      "/admin/products?q=mug&category=home-kitchen",
    )
  })

  it("falls back to defaults for invalid params", async () => {
    await renderProducts({ stock: "none", category: "Bad Slug!", page: "0" })

    expect(listAdminProducts).toHaveBeenCalledExactlyOnceWith({
      q: undefined,
      category: undefined,
      stock: undefined,
      page: 1,
      pageSize: 20,
    })
  })

  it("shows an empty state with a way to clear the filters", async () => {
    await renderProducts({ q: "nothing" })

    expect(screen.getByText("No products found")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/admin/products")
  })

  it("paginates, keeping the filters", async () => {
    listAdminProducts.mockResolvedValue({ items: [productSummary()], page: 2, pageSize: 20, total: 45, pageCount: 3 })

    await renderProducts({ stock: "low", page: "2" })

    const nav = screen.getByRole("navigation", { name: "Pagination" })
    expect(within(nav).getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/admin/products?stock=low")
    expect(within(nav).getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/admin/products?stock=low&page=3",
    )
  })
})

describe("admin product form pages", () => {
  it("shows an empty form for a new product", async () => {
    render(await NewProductPage())

    expect(screen.getByRole("heading", { level: 1, name: "New product" })).toBeInTheDocument()
    expect(screen.getByRole("form", { name: "New product" })).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("")
  })

  it("is a 404 for an unknown product", async () => {
    await expect(renderEditProduct(PRODUCT_ID)).rejects.toMatchObject(NOT_FOUND)
    expect(getAdminProduct).toHaveBeenCalledExactlyOnceWith(PRODUCT_ID)
  })

  it("is a 404 for an id that isn't a UUID, without querying", async () => {
    await expect(renderEditProduct("not-a-uuid")).rejects.toMatchObject(NOT_FOUND)
    expect(getAdminProduct).not.toHaveBeenCalled()
  })

  it("shows the product in the form with store and delete buttons", async () => {
    getAdminProduct.mockResolvedValue(adminProduct)

    await renderEditProduct(PRODUCT_ID)

    expect(screen.getByRole("heading", { level: 1, name: "Trail Mug" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View in store" })).toHaveAttribute("href", "/products/trail-mug")
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
    expect(screen.getByLabelText("Price")).toHaveValue("12.50")
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
