import { describe, expect, it } from "vitest"

import { adminProductHref, adminProductsHref, parseAdminProductQuery } from "@/lib/admin-product-list"

describe("parseAdminProductQuery", () => {
  it("defaults to page 1 of 20 with no filters", () => {
    expect(parseAdminProductQuery({})).toEqual({
      q: undefined,
      category: undefined,
      stock: undefined,
      page: 1,
      pageSize: 20,
    })
  })

  it("reads every filter, trimming and taking the first of repeated keys", () => {
    expect(
      parseAdminProductQuery({ q: "  mug ", category: ["audio", "home"], stock: "low", page: "3", pageSize: "50" }),
    ).toEqual({ q: "mug", category: "audio", stock: "low", page: 3, pageSize: 50 })
  })

  it("drops only the invalid params", () => {
    expect(
      parseAdminProductQuery({ q: "mug", category: "Not A Slug", stock: "none", page: "0", pageSize: "101" }),
    ).toEqual({ q: "mug", category: undefined, stock: undefined, page: 1, pageSize: 20 })
  })

  it("treats empty params as not set", () => {
    expect(parseAdminProductQuery({ q: "", category: " ", stock: "" })).toMatchObject({
      q: undefined,
      category: undefined,
      stock: undefined,
    })
  })
})

describe("adminProductsHref", () => {
  it("is the bare path without filters", () => {
    expect(adminProductsHref()).toBe("/admin/products")
    expect(adminProductsHref({ page: 1, pageSize: 20 })).toBe("/admin/products")
  })

  it("keeps the filters in a stable order and leaves defaults out", () => {
    expect(adminProductsHref({ page: 2, stock: "low", category: "audio", q: "trail mug", pageSize: 50 })).toBe(
      "/admin/products?q=trail+mug&category=audio&stock=low&pageSize=50&page=2",
    )
  })

  it("round-trips through parseAdminProductQuery", () => {
    const query = { q: "a&b", category: "home-kitchen", stock: "low" as const, page: 4, pageSize: 10 }
    const href = adminProductsHref(query)
    const params = Object.fromEntries(new URL(href, "http://x").searchParams)
    expect(parseAdminProductQuery(params)).toEqual(query)
  })

  it("links to a product's edit page", () => {
    expect(adminProductHref("abc")).toBe("/admin/products/abc")
  })
})
