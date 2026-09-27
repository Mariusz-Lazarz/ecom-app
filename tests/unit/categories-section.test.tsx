import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { Category } from "@/lib/categories"

const categories: Category[] = [
  { id: "1", slug: "audio", name: "Audio", icon: "headphones" },
  { id: "2", slug: "bags", name: "Bags", icon: "backpack" },
  { id: "3", slug: "mystery", name: "Mystery", icon: "not-a-real-icon" },
]

vi.mock("@/lib/categories", () => ({ listCategories: vi.fn(async () => categories) }))

const { CategoriesSection } = await import("@/components/home/categories-section")

// Async Server Component: resolve it first, then render the element it returns.
const renderSection = async () => render(await CategoriesSection())

describe("CategoriesSection", () => {
  it("renders a section heading with a link to all categories", async () => {
    await renderSection()

    expect(screen.getByRole("heading", { level: 2, name: "Shop by category" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /all categories/i })).toHaveAttribute(
      "href",
      "/categories"
    )
  })

  it("renders one tile per category from the database, in order", async () => {
    await renderSection()

    const tileLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/categories/"))
    expect(tileLinks.map((link) => link.getAttribute("href"))).toEqual(
      categories.map((c) => `/categories/${c.slug}`)
    )

    for (const category of categories) {
      const tile = screen.getByRole("link", { name: new RegExp(`^${category.name}`) })
      expect(within(tile).getByText("Shop now")).toBeInTheDocument()
      // Icon is decorative; unknown icon names still get the fallback icon
      expect(tile.querySelector("svg")).not.toBeNull()
    }
  })
})
