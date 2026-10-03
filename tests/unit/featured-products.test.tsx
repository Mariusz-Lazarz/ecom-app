import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { makeProduct } from "./fixtures/products"

vi.mock("server-only", () => ({}))
// Product cards import the cart Server Actions, which outside Next.js would pull in the cart module.
vi.mock("@/app/actions/cart", () => ({ addToCart: vi.fn() }))
const listProducts = vi.fn()
vi.mock("@/lib/products", () => ({ listProducts }))

const { FeaturedProducts, FEATURED_LIMIT } = await import("@/components/home/featured-products")

// Async Server Component: resolve it first, then render the element it returns.
const renderSection = async () => render(await FeaturedProducts())

const products = [makeProduct({ name: "Aria" }), makeProduct({ name: "Pulse" }), makeProduct({ name: "Tern" })]

beforeEach(() => {
  listProducts.mockReset().mockResolvedValue({ items: products, page: 1, pageSize: 8, total: 3, pageCount: 1 })
})

describe("FeaturedProducts", () => {
  it("asks the catalogue for one page of featured products", async () => {
    await renderSection()

    expect(listProducts).toHaveBeenCalledExactlyOnceWith({ featured: true, pageSize: FEATURED_LIMIT })
    expect(FEATURED_LIMIT).toBe(8)
  })

  it("renders the section heading and a link to the full catalogue", async () => {
    await renderSection()

    expect(screen.getByRole("heading", { level: 2, name: "Featured products" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /view all products/i })).toHaveAttribute("href", "/products")
  })

  it("renders one card per product, in the order returned", async () => {
    const { container } = await renderSection()

    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(products.length)
    const productLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/products/"))
    expect(productLinks.map((link) => link.textContent)).toEqual(["Aria", "Pulse", "Tern"])
  })

  it("renders no cards when nothing is featured", async () => {
    listProducts.mockResolvedValue({ items: [], page: 1, pageSize: 8, total: 0, pageCount: 0 })
    const { container } = await renderSection()

    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(0)
    expect(screen.getByRole("heading", { name: "Featured products" })).toBeInTheDocument()
  })
})
