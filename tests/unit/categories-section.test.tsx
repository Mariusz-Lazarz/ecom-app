import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CategoriesSection } from "@/components/home/categories-section"
import { categories } from "@/lib/data"

describe("CategoriesSection", () => {
  it("renders a section heading with a link to all categories", () => {
    render(<CategoriesSection />)

    expect(screen.getByRole("heading", { level: 2, name: "Shop by category" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /all categories/i })).toHaveAttribute(
      "href",
      "/categories"
    )
  })

  it("renders one tile per category linking to its own page", () => {
    render(<CategoriesSection />)

    for (const category of categories) {
      const tile = screen.getByRole("link", { name: new RegExp(`^${category.name}`) })
      expect(tile).toHaveAttribute("href", `/categories/${category.slug}`)
      expect(within(tile).getByText(`${category.count} products`)).toBeInTheDocument()
      // Icon is decorative and rendered inside the tile
      expect(tile.querySelector("svg")).not.toBeNull()
    }
  })

  it("does not render tiles for anything outside the category list", () => {
    render(<CategoriesSection />)

    const tileLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/categories/"))
    expect(tileLinks).toHaveLength(categories.length)
  })
})
