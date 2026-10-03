import { describe, expect, it } from "vitest"
import * as z from "zod"

import { ProductListQuerySchema, searchParamsToObject } from "@/lib/validation/products"

const fieldErrors = (input: unknown) => {
  const result = ProductListQuerySchema.safeParse(input)
  expect(result.success).toBe(false)
  return z.flattenError(result.error!).fieldErrors
}

describe("ProductListQuerySchema", () => {
  it("fills in the defaults for an empty query", () => {
    expect(ProductListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 12, sort: "featured" })
  })

  it("coerces and trims string params and drops unknown keys", () => {
    expect(
      ProductListQuerySchema.parse({
        page: "3",
        pageSize: " 24 ",
        q: "  leather boots ",
        category: "footwear",
        sort: "rating",
        onSale: "yes",
        featured: "false",
        utm_source: "mail",
      }),
    ).toEqual({
      page: 3,
      pageSize: 24,
      q: "leather boots",
      category: "footwear",
      sort: "rating",
      onSale: true,
      featured: false,
    })
  })

  it("treats empty and blank params as not set", () => {
    const result = ProductListQuerySchema.parse({ page: "", q: "   ", category: "", onSale: "", sort: "" })
    expect(result).toMatchObject({ page: 1, sort: "featured" })
    expect(result.q).toBeUndefined()
    expect(result.category).toBeUndefined()
    expect(result.onSale).toBeUndefined()
  })

  it("uses the first value of a repeated param", () => {
    expect(ProductListQuerySchema.parse({ page: ["2", "5"], sort: ["newest", "rating"] })).toMatchObject({
      page: 2,
      sort: "newest",
    })
  })

  it.each(["featured", "newest", "price-asc", "price-desc", "rating"])("accepts sort=%s", (sort) => {
    expect(ProductListQuerySchema.parse({ sort }).sort).toBe(sort)
  })

  it.each([
    ["1", true],
    ["true", true],
    ["TRUE", true],
    ["on", true],
    ["0", false],
    ["false", false],
    ["no", false],
  ])("reads onSale=%s as %s", (value, expected) => {
    expect(ProductListQuerySchema.parse({ onSale: value }).onSale).toBe(expected)
  })

  it("accepts the page and page size bounds", () => {
    expect(ProductListQuerySchema.parse({ page: "1", pageSize: "1" })).toMatchObject({ page: 1, pageSize: 1 })
    expect(ProductListQuerySchema.parse({ page: "1000", pageSize: "48" })).toMatchObject({ page: 1000, pageSize: 48 })
  })

  it.each([
    ["page", "0"],
    ["page", "1001"],
    ["page", "-1"],
    ["page", "1.5"],
    ["page", "abc"],
    ["pageSize", "0"],
    ["pageSize", "49"],
    ["sort", "cheapest"],
    ["onSale", "maybe"],
    ["featured", "2"],
    ["category", "Audio"],
    ["category", "audio;drop"],
    ["category", "a".repeat(65)],
  ])("rejects %s=%s", (key, value) => {
    expect(Object.keys(fieldErrors({ [key]: value }))).toEqual([key])
  })

  it("allows a search of up to 100 characters", () => {
    expect(ProductListQuerySchema.parse({ q: "x".repeat(100) }).q).toHaveLength(100)
    expect(fieldErrors({ q: "x".repeat(101) }).q).toEqual(["Too big: expected string to have <=100 characters"])
  })

  it("keeps search wildcards as plain text (escaping happens in the query)", () => {
    expect(ProductListQuerySchema.parse({ q: "100% wool_mix" }).q).toBe("100% wool_mix")
  })
})

describe("searchParamsToObject", () => {
  it("keeps single values as strings and repeated keys as arrays", () => {
    expect(searchParamsToObject(new URLSearchParams("q=boots&page=2&tag=a&tag=b"))).toEqual({
      q: "boots",
      page: "2",
      tag: ["a", "b"],
    })
  })

  it("returns an empty object for no params", () => {
    expect(searchParamsToObject(new URLSearchParams(""))).toEqual({})
  })
})
