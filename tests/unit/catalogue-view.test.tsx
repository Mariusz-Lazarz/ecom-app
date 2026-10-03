import { render, screen, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { makeProduct } from "./fixtures/products"

vi.mock("@/lib/notify", () => ({ notify: { info: vi.fn() } }))

const { Catalogue } = await import("@/components/products/catalogue")
const { parseCatalogueQuery } = await import("@/lib/catalogue")

const categories = [
  { id: "1", slug: "audio", name: "Audio", icon: "headphones" },
  { id: "2", slug: "bags", name: "Bags", icon: "backpack" },
]

const page = (items: number, total: number, pageNumber = 1, pageSize = 12) => ({
  items: Array.from({ length: items }, () => makeProduct()),
  page: pageNumber,
  pageSize,
  total,
  pageCount: Math.ceil(total / pageSize),
})

function renderCatalogue(props: Partial<ComponentProps<typeof Catalogue>> & { search?: Record<string, string> } = {}) {
  const { search = {}, ...rest } = props
  return render(
    <Catalogue
      basePath="/products"
      title="All products"
      query={parseCatalogueQuery(search)}
      categories={categories}
      list={page(3, 3)}
      {...rest}
    />,
  )
}

const hrefOf = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href")

describe("Catalogue", () => {
  it("shows the title, the range shown and one card per product", () => {
    const { container } = renderCatalogue({ list: page(12, 28, 2), search: { page: "2" } })

    expect(screen.getByRole("heading", { level: 1, name: "All products" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Showing 13–24 of 28 products")
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(12)
  })

  it("uses the singular for a single result", () => {
    renderCatalogue({ list: page(1, 1) })

    expect(screen.getByRole("status")).toHaveTextContent("Showing 1–1 of 1 product")
  })

  it("links categories to their pages, keeping search, sort and sale filter but not the page", () => {
    renderCatalogue({ search: { q: "black", sort: "rating", onSale: "true", page: "2" }, list: page(1, 13, 2) })

    const nav = screen.getByRole("navigation", { name: "Categories" })
    expect(within(nav).getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["All", "/products?q=black&sort=rating&onSale=true"],
      ["Audio", "/categories/audio?q=black&sort=rating&onSale=true"],
      ["Bags", "/categories/bags?q=black&sort=rating&onSale=true"],
    ])
  })

  it("marks the active category, or All when none is chosen", () => {
    const { unmount } = renderCatalogue()
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page")
    unmount()

    renderCatalogue({ basePath: "/categories/bags", activeCategory: "bags" })
    expect(screen.getByRole("link", { name: "Bags" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "All" })).not.toHaveAttribute("aria-current")
  })

  it("toggles the sale filter on and off, back to page 1", () => {
    const { unmount } = renderCatalogue({ search: { sort: "newest", page: "2" }, list: page(1, 13, 2) })
    expect(hrefOf(/On sale only/)).toBe("/products?sort=newest&onSale=true")
    unmount()

    renderCatalogue({ search: { sort: "newest", onSale: "true" } })
    expect(hrefOf(/On sale only/)).toBe("/products?sort=newest")
  })

  it("shows the search term with a link that clears only the search", () => {
    renderCatalogue({ basePath: "/categories/audio", activeCategory: "audio", search: { q: "anc", onSale: "true" } })

    expect(screen.getByText("“anc”")).toBeInTheDocument()
    expect(hrefOf("Clear search")).toBe("/categories/audio?onSale=true")
  })

  it("shows no search chip without a search", () => {
    renderCatalogue()

    expect(screen.queryByRole("link", { name: "Clear search" })).not.toBeInTheDocument()
  })

  it("paginates with links that keep the other filters", () => {
    renderCatalogue({ search: { q: "bag", page: "2" }, list: page(12, 30, 2) })

    const nav = screen.getByRole("navigation", { name: "Pagination" })
    expect(within(nav).getByRole("link", { name: /Previous/ })).toHaveAttribute("href", "/products?q=bag")
    expect(within(nav).getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/products?q=bag&page=3")
    expect(within(nav).getByRole("link", { name: "Page 2" })).toHaveAttribute("aria-current", "page")
    expect(within(nav).getByRole("link", { name: "Page 3" })).toHaveAttribute("href", "/products?q=bag&page=3")
  })

  it("disables Previous on the first page and Next on the last", () => {
    const { unmount } = renderCatalogue({ list: page(12, 24, 1) })
    let nav = screen.getByRole("navigation", { name: "Pagination" })
    expect(within(nav).queryByRole("link", { name: /Previous/ })).not.toBeInTheDocument()
    expect(within(nav).getByRole("link", { name: /Next/ })).toBeInTheDocument()
    unmount()

    renderCatalogue({ search: { page: "2" }, list: page(12, 24, 2) })
    nav = screen.getByRole("navigation", { name: "Pagination" })
    expect(within(nav).getByRole("link", { name: /Previous/ })).toBeInTheDocument()
    expect(within(nav).queryByRole("link", { name: /Next/ })).not.toBeInTheDocument()
  })

  it("hides pagination when everything fits on one page", () => {
    renderCatalogue({ list: page(12, 12) })

    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument()
  })

  it("shows an empty state that clears every filter when nothing matches", () => {
    renderCatalogue({ search: { q: "zzz", onSale: "true" }, list: page(0, 0) })

    expect(screen.getByRole("status")).toHaveTextContent("No products")
    expect(screen.getByRole("heading", { name: "No products match your filters" })).toBeInTheDocument()
    expect(hrefOf("Clear filters")).toBe("/products")
  })

  it("keeps the category when clearing filters on a category page", () => {
    renderCatalogue({ basePath: "/categories/bags", activeCategory: "bags", search: { q: "zzz" }, list: page(0, 0) })

    expect(hrefOf("Clear filters")).toBe("/categories/bags")
  })

  it("points a page past the end back to page 1 of the same filters", () => {
    renderCatalogue({ search: { q: "bag", page: "9" }, list: page(0, 20, 9) })

    expect(screen.getByRole("heading", { name: "This page is empty" })).toBeInTheDocument()
    expect(screen.getByText("There are only 2 pages of results.")).toBeInTheDocument()
    expect(hrefOf("Go to the first page")).toBe("/products?q=bag")
  })

  it("submits the sort as a GET form that keeps the other filters", () => {
    renderCatalogue({ search: { q: "bag", onSale: "1", sort: "price-desc" } })

    const select = screen.getByRole("combobox", { name: "Sort by" })
    expect(select).toHaveValue("price-desc")
    const form = select.closest("form")!
    expect(form).toHaveAttribute("action", "/products")
    const hidden = [...form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((i) => [i.name, i.value])
    expect(hidden).toEqual([
      ["q", "bag"],
      ["onSale", "true"],
    ])
  })
})
