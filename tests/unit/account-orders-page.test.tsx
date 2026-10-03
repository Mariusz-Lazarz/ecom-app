import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { makeOrderSummary } from "./fixtures/orders"

const requireUser = vi.fn()
const listOrdersForUser = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth-guards", () => ({ requireUser: (path: string) => requireUser(path) }))
vi.mock("@/lib/orders", () => ({ listOrdersForUser: (...args: unknown[]) => listOrdersForUser(...args) }))
// SiteHeader is an async Server Component (reads the session) and has its own tests.
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header /> }))

const { default: AccountOrdersPage } = await import("@/app/account/orders/page")

async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const ui = await AccountOrdersPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) })
  return render(ui)
}

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue({ user: { id: "user-1" } })
  listOrdersForUser.mockReset().mockImplementation(async (_id: string, { page, pageSize }: { page: number; pageSize: number }) => ({
    items: [makeOrderSummary({ number: "NC-10001" })],
    page,
    pageSize,
    total: 1,
    pageCount: 1,
  }))
})

describe("Account orders page", () => {
  it("lists the signed-in user's orders, 10 per page, from page 1", async () => {
    await renderPage()

    expect(requireUser).toHaveBeenCalledExactlyOnceWith("/account/orders")
    expect(listOrdersForUser).toHaveBeenCalledExactlyOnceWith("user-1", { page: 1, pageSize: 10 })
    expect(screen.getByRole("heading", { level: 1, name: "Your orders" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /NC-10001/ })).toHaveAttribute("href", "/orders/NC-10001")
  })

  it.each([
    ["2", 2],
    ["1000", 1000],
    [["3", "4"], 3],
    ["0", 1],
    ["-1", 1],
    ["1.5", 1],
    ["1001", 1],
    ["abc", 1],
    ["", 1],
  ])("reads ?page=%j as page %i", async (value, expected) => {
    await renderPage({ page: value })
    expect(listOrdersForUser).toHaveBeenCalledExactlyOnceWith("user-1", { page: expected, pageSize: 10 })
  })
})
