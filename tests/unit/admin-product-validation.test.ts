import { describe, expect, it } from "vitest"

import {
  MAX_PRICE_CENTS,
  MAX_SPECS,
  ProductFormSchema,
  centsToDollars,
  dollarsToCents,
  productFieldErrors,
  slugify,
} from "@/lib/validation/admin-products"

const CATEGORY_ID = "2f1c9a4e-8b7d-4c3a-9e1f-0a2b3c4d5e6f"
const KEY_A = `products/${"a".repeat(32)}.webp`
const KEY_B = `products/${"b".repeat(32)}.webp`

const valid = {
  name: "  Trail Mug  ",
  slug: "Trail-Mug",
  brand: "Halden",
  categoryId: CATEGORY_ID,
  shortDescription: "Enamel mug.",
  description: "A sturdy enamel mug for camping.",
  price: "12.50",
  compareAt: "",
  stock: "7",
  badge: "",
  featured: false,
  specs: [] as unknown[],
  images: [] as unknown[],
}

const parse = (overrides: Record<string, unknown> = {}) => ProductFormSchema.safeParse({ ...valid, ...overrides })
const errorsOf = (overrides: Record<string, unknown>) => {
  const result = parse(overrides)
  expect(result.success).toBe(false)
  return productFieldErrors(result.error!)
}

describe("slugify", () => {
  it.each([
    ["Trail Mug", "trail-mug"],
    ["  Café Crème — 250 ml!  ", "cafe-creme-250-ml"],
    ["100% Cotton_Tee", "100-cotton-tee"],
    ["---", ""],
    ["", ""],
  ])("%j → %j", (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it("caps the slug at 100 characters without a trailing dash", () => {
    const slug = slugify(`${"a".repeat(99)} b`)
    expect(slug).toBe("a".repeat(99))
  })
})

describe("price conversion", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.50", 1250],
    ["0", 0],
    ["0.01", 1],
    ["$1,299.99", 129999],
    [" 49.99 ", 4999],
  ])("dollarsToCents(%j) = %d", (input, cents) => {
    expect(dollarsToCents(input)).toBe(cents)
  })

  it.each(["", "abc", "12.999", "-5", "1.2.3", "12,5", ".5"])("dollarsToCents(%j) is null", (input) => {
    expect(dollarsToCents(input)).toBeNull()
  })

  it.each([
    [1250, "12.50"],
    [0, "0.00"],
    [1, "0.01"],
    [129999, "1299.99"],
  ])("centsToDollars(%d) = %j", (cents, dollars) => {
    expect(centsToDollars(cents)).toBe(dollars)
  })
})

describe("ProductFormSchema", () => {
  it("parses a valid form into cents, trimmed text and nulls for empty optional fields", () => {
    const result = parse()
    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      name: "Trail Mug",
      slug: "trail-mug",
      brand: "Halden",
      categoryId: CATEGORY_ID,
      shortDescription: "Enamel mug.",
      description: "A sturdy enamel mug for camping.",
      price: 1250,
      compareAt: null,
      stock: 7,
      badge: null,
      featured: false,
      specs: [],
      images: [],
    })
  })

  it("accepts a compare-at price above the price", () => {
    expect(parse({ price: "10", compareAt: "10.01" }).data?.compareAt).toBe(1001)
  })

  it.each([
    ["equal to", "10.00"],
    ["below", "9.99"],
  ])("rejects a compare-at price %s the price", (_, compareAt) => {
    expect(errorsOf({ price: "10", compareAt })).toEqual({
      compareAt: ["Compare-at price must be higher than the price, or empty."],
    })
  })

  it("reports missing required fields", () => {
    const errors = errorsOf({ name: " ", slug: "", brand: "", categoryId: "", shortDescription: "", description: "", price: "", stock: "" })
    expect(errors).toEqual({
      name: ["Name is required."],
      slug: ["Slug is required."],
      brand: ["Brand is required."],
      categoryId: ["Choose a category."],
      shortDescription: ["Short description is required."],
      description: ["Description is required."],
      price: ["Price must be an amount like 49 or 49.99."],
      stock: ["Stock must be a whole number, 0 or more."],
    })
  })

  it.each(["trail mug", "trail--mug", "-trail", "trail_mug", "trailé"])("rejects the slug %j", (slug) => {
    expect(errorsOf({ slug }).slug).toEqual(["Use lower-case letters, digits and single dashes."])
  })

  it("rejects prices above the maximum and accepts the maximum", () => {
    expect(parse({ price: String(MAX_PRICE_CENTS / 100) }).success).toBe(true)
    expect(errorsOf({ price: String(MAX_PRICE_CENTS / 100 + 1) }).price).toEqual(["Price must be at most $1000000."])
  })

  it.each([
    ["-1", "Stock must be a whole number, 0 or more."],
    ["1.5", "Stock must be a whole number, 0 or more."],
    ["1000001", "Stock must be at most 1000000."],
  ])("rejects the stock %j", (stock, message) => {
    expect(errorsOf({ stock }).stock).toEqual([message])
  })

  it("accepts 0 stock", () => {
    expect(parse({ stock: "0" }).data?.stock).toBe(0)
  })

  it("keeps specs in order and names the row of an invalid one", () => {
    const specs = [
      { label: " Weight ", value: "250 g" },
      { label: "", value: "Steel" },
    ]
    expect(errorsOf({ specs })).toEqual({ specs: ["Row 2: Label is required."] })
    expect(parse({ specs: specs.slice(0, 1) }).data?.specs).toEqual([{ label: "Weight", value: "250 g" }])
  })

  it(`allows at most ${MAX_SPECS} specs`, () => {
    const specs = Array.from({ length: MAX_SPECS + 1 }, (_, i) => ({ label: `L${i}`, value: "v" }))
    expect(errorsOf({ specs }).specs).toEqual([`At most ${MAX_SPECS} specs.`])
  })

  it("defaults blank alt text to the product name and keeps the image order", () => {
    const images = [
      { key: KEY_B, width: 800, height: 600, alt: "  " },
      { key: KEY_A, width: 100, height: 100, alt: "Side view" },
    ]
    expect(parse({ images }).data?.images).toEqual([
      { key: KEY_B, width: 800, height: 600, alt: "Trail Mug" },
      { key: KEY_A, width: 100, height: 100, alt: "Side view" },
    ])
  })

  it.each(["other/abc.webp", "products/../secret.webp", `products/${"a".repeat(32)}.png`])(
    "rejects the image key %j",
    (key) => {
      expect(errorsOf({ images: [{ key, width: 1, height: 1, alt: "" }] }).images).toEqual([
        "Image 1: Upload the image again.",
      ])
    },
  )
})
