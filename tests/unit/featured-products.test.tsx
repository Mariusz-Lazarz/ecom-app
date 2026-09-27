import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FeaturedProducts } from "@/components/home/featured-products"
import { featuredProducts, type Product } from "@/lib/data"

function getCard(product: Product) {
  // Each card is the closest data-slot="card" ancestor of the product's title link
  const titleLink = screen.getByRole("link", { name: product.name })
  return titleLink.closest<HTMLElement>('[data-slot="card"]')!
}

describe("FeaturedProducts", () => {
  it("renders the section heading and a link to the full catalogue", () => {
    render(<FeaturedProducts />)

    expect(screen.getByRole("heading", { level: 2, name: "Featured products" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /view all products/i })).toHaveAttribute(
      "href",
      "/products"
    )
  })

  it("renders exactly one card per featured product", () => {
    const { container } = render(<FeaturedProducts />)

    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(featuredProducts.length)
  })

  it.each(featuredProducts)("announces a single link to the product page for $name", (product) => {
    render(<FeaturedProducts />)

    const accessibleLinks = within(getCard(product)).getAllByRole("link")
    expect(accessibleLinks).toHaveLength(1)
    expect(accessibleLinks[0]).toHaveAccessibleName(product.name)
    expect(accessibleLinks[0]).toHaveAttribute("href", `/products/${product.slug}`)
  })

  it.each(featuredProducts)("keeps the photo link clickable but out of tab order for $name", (product) => {
    render(<FeaturedProducts />)

    const photoLink = within(getCard(product)).getByAltText(product.name).closest("a")!
    expect(photoLink).toHaveAttribute("href", `/products/${product.slug}`)
    expect(photoLink).toHaveAttribute("aria-hidden", "true")
    expect(photoLink).toHaveAttribute("tabindex", "-1")
  })

  it.each(featuredProducts)("shows category, rating and review count for $name", (product) => {
    render(<FeaturedProducts />)

    const card = getCard(product)
    expect(within(card).getByText(product.category)).toBeInTheDocument()
    expect(within(card).getByText(String(product.rating))).toBeInTheDocument()
    expect(within(card).getByText(`(${product.reviews})`)).toBeInTheDocument()
  })

  it.each(featuredProducts)("renders an optimised, described product photo for $name", (product) => {
    render(<FeaturedProducts />)

    const image = within(getCard(product)).getByAltText(product.name)
    // next/image routes remote photos through the optimiser with the original URL encoded
    const src = new URL(image.getAttribute("src")!, "http://localhost")
    expect(src.pathname).toBe("/_next/image")
    expect(src.searchParams.get("url")).toBe(product.image)
  })

  it("formats prices as US dollars", () => {
    render(<FeaturedProducts />)

    const watch = featuredProducts.find((p) => p.slug === "minimal-analog-watch")!
    expect(within(getCard(watch)).getByText("$149.00")).toBeInTheDocument()
  })

  it("shows a struck-through compare-at price only for discounted products", () => {
    render(<FeaturedProducts />)

    for (const product of featuredProducts) {
      const card = getCard(product)
      const struck = card.querySelectorAll(".line-through")
      if (product.compareAt) {
        expect(struck).toHaveLength(1)
        expect(struck[0]).toHaveTextContent(`$${product.compareAt}.00`)
      } else {
        expect(struck).toHaveLength(0)
      }
    }
  })

  it("highlights the price in red only for discounted products", () => {
    render(<FeaturedProducts />)

    for (const product of featuredProducts) {
      const price = within(getCard(product)).getByText(`$${product.price}.00`)
      if (product.compareAt) {
        expect(price).toHaveClass("text-destructive")
      } else {
        expect(price).not.toHaveClass("text-destructive")
      }
    }
  })

  it("shows a badge only on products that define one", () => {
    render(<FeaturedProducts />)

    for (const product of featuredProducts) {
      const badges = getCard(product).querySelectorAll('[data-slot="badge"]')
      if (product.badge) {
        expect(badges).toHaveLength(1)
        expect(badges[0]).toHaveTextContent(product.badge)
        // Badges carry information (e.g. the discount), so they must not sit inside the aria-hidden photo link
        expect(badges[0].closest('[aria-hidden="true"]')).toBeNull()
      } else {
        expect(badges).toHaveLength(0)
      }
    }
  })

  it("gives each add-to-cart button a name that identifies the product", () => {
    render(<FeaturedProducts />)

    const buttons = screen.getAllByRole("button", { name: /^Add .* to cart$/ })
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(
      featuredProducts.map((p) => `Add ${p.name} to cart`)
    )
  })
})
