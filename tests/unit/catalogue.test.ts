import { describe, expect, it } from "vitest"

import {
  catalogueHref,
  discountPercent,
  formatPrice,
  paginationRange,
  parseCatalogueQuery,
} from "@/lib/catalogue"
import { DEFAULT_PAGE_SIZE } from "@/lib/validation/products"

const defaults = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  q: undefined,
  category: undefined,
  sort: "featured",
  onSale: undefined,
}

describe("parseCatalogueQuery", () => {
  it("returns the defaults for an empty query", () => {
    expect(parseCatalogueQuery({})).toEqual(defaults)
  })

  it("reads valid filters, trimming the search term", () => {
    expect(
      parseCatalogueQuery({ q: "  leather  ", category: "bags", sort: "price-desc", onSale: "true", page: "3" }),
    ).toEqual({ ...defaults, q: "leather", category: "bags", sort: "price-desc", onSale: true, page: 3 })
  })

  it("uses the first value when a key repeats", () => {
    expect(parseCatalogueQuery({ sort: ["newest", "rating"] }).sort).toBe("newest")
  })

  it("drops only the invalid params and keeps the valid ones", () => {
    expect(
      parseCatalogueQuery({ sort: "cheapest", page: "-1", onSale: "maybe", category: "Not A Slug!", q: "watch" }),
    ).toEqual({ ...defaults, q: "watch" })
  })

  it("falls back on page numbers beyond the limit or not integers", () => {
    expect(parseCatalogueQuery({ page: "1001" }).page).toBe(1)
    expect(parseCatalogueQuery({ page: "2.5" }).page).toBe(1)
    expect(parseCatalogueQuery({ page: "1000" }).page).toBe(1000)
  })

  it("treats an empty search as no search and ignores unknown keys", () => {
    const query = parseCatalogueQuery({ q: "   ", utm_source: "mail" })
    expect(query).toEqual(defaults)
    expect(query).not.toHaveProperty("utm_source")
  })

  it("does not pass the featured filter through", () => {
    expect(parseCatalogueQuery({ featured: "true" })).not.toHaveProperty("featured")
  })
})

describe("catalogueHref", () => {
  it("returns the bare path when every filter is at its default", () => {
    expect(catalogueHref("/products", {})).toBe("/products")
    expect(
      catalogueHref("/products", { page: 1, sort: "featured", onSale: false, pageSize: DEFAULT_PAGE_SIZE }),
    ).toBe("/products")
  })

  it("includes every non-default filter in a stable order", () => {
    expect(
      catalogueHref("/products", { page: 2, sort: "newest", onSale: true, q: "red shoes", category: "footwear" }),
    ).toBe("/products?q=red+shoes&category=footwear&sort=newest&onSale=true&page=2")
  })

  it("keeps a non-default page size", () => {
    expect(catalogueHref("/categories/audio", { pageSize: 24 })).toBe("/categories/audio?pageSize=24")
  })

  it("encodes special characters in the search term", () => {
    expect(catalogueHref("/products", { q: "50% & more" })).toBe("/products?q=50%25+%26+more")
  })

  it("round-trips through parseCatalogueQuery", () => {
    const query = { ...defaults, q: "leather bag", category: "bags", sort: "rating" as const, onSale: true, page: 2 }
    const href = catalogueHref("/products", query)
    const params = Object.fromEntries(new URL(href, "http://localhost").searchParams)
    expect(parseCatalogueQuery(params)).toEqual(query)
  })
})

describe("paginationRange", () => {
  it("returns nothing when there are no pages", () => {
    expect(paginationRange(1, 0)).toEqual([])
  })

  it("lists every page when there are few", () => {
    expect(paginationRange(1, 1)).toEqual([1])
    expect(paginationRange(2, 2)).toEqual([1, 2])
    expect(paginationRange(3, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it("collapses gaps of two or more pages into an ellipsis", () => {
    expect(paginationRange(1, 10)).toEqual([1, 2, "ellipsis", 10])
    expect(paginationRange(5, 10)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 10])
    expect(paginationRange(10, 10)).toEqual([1, "ellipsis", 9, 10])
  })

  it("shows a single skipped page instead of an ellipsis", () => {
    expect(paginationRange(4, 10)).toEqual([1, 2, 3, 4, 5, "ellipsis", 10])
    expect(paginationRange(7, 10)).toEqual([1, "ellipsis", 6, 7, 8, 9, 10])
  })

  it("clamps a current page outside the range", () => {
    expect(paginationRange(99, 3)).toEqual([1, 2, 3])
    expect(paginationRange(0, 10)).toEqual([1, 2, "ellipsis", 10])
  })

  it("widens the window with more siblings", () => {
    expect(paginationRange(10, 20, 2)).toEqual([1, "ellipsis", 8, 9, 10, 11, 12, "ellipsis", 20])
  })
})

describe("formatPrice", () => {
  it("formats cents as currency", () => {
    expect(formatPrice(14900)).toBe("$149.00")
    expect(formatPrice(0)).toBe("$0.00")
    expect(formatPrice(5)).toBe("$0.05")
    expect(formatPrice(249999)).toBe("$2,499.99")
  })

  it("uses the given currency", () => {
    expect(formatPrice(1000, "EUR")).toBe("€10.00")
  })
})

describe("discountPercent", () => {
  it("rounds the discount to a whole percent", () => {
    expect(discountPercent(29900, 34900)).toBe(14)
    expect(discountPercent(7900, 9900)).toBe(20)
    expect(discountPercent(1, 3)).toBe(67)
  })

  it("returns null when there is no discount", () => {
    expect(discountPercent(1000, null)).toBeNull()
    expect(discountPercent(1000, 1000)).toBeNull()
    expect(discountPercent(1000, 900)).toBeNull()
  })
})
