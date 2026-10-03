import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
// connection() only opts a render out of prerendering; outside a Next.js request it throws.
vi.mock("next/server", () => ({ connection: async () => {} }))

// Runs the catalogue queries against the docker compose Postgres. Every test works on its own
// throwaway category and products (removed afterwards), so seed data never affects the results.
if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const { getProductBySlug, listProducts } = await import("@/lib/products")

const run = Array.from({ length: 10 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")
const categorySlug = `test-${run}`
const slug = (name: string) => `${categorySlug}-${name}`
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)

// Five products, chosen so each sort gives a different order. `run` makes every name unique, so
// searching for it only ever finds these.
type Fixture = {
  key: string
  name: string
  short?: string
  price: number
  compareAt: number | null
  rating: number
  reviews: number
  featured: boolean
  stock: number
  created: Date
  badge: string | null
}

const fixtures: Fixture[] = [
  {
    key: "alpha",
    name: `Alpha Widget ${run}`,
    price: 1000,
    compareAt: 1500,
    rating: 4.5,
    reviews: 10,
    featured: true,
    stock: 3,
    created: daysAgo(1),
    badge: "New",
  },
  {
    key: "bravo",
    name: `Bravo 100% Cotton ${run}`,
    price: 3000,
    compareAt: null,
    rating: 3,
    reviews: 4,
    featured: false,
    stock: 8,
    created: daysAgo(5),
    badge: null,
  },
  {
    key: "charlie",
    name: `Charlie_Gadget ${run}`,
    price: 2000,
    compareAt: null,
    rating: 5,
    reviews: 2,
    featured: false,
    stock: 1,
    created: daysAgo(3),
    badge: null,
  },
  {
    key: "delta",
    name: `Delta ${run}`,
    price: 500,
    compareAt: 900,
    rating: 4,
    reviews: 7,
    featured: false,
    stock: 0,
    created: daysAgo(2),
    badge: null,
  },
  {
    key: "echo",
    name: `Echo ${run}`,
    short: "Short echo, pairs well with Delta",
    price: 4000,
    compareAt: null,
    rating: 2,
    reviews: 1,
    featured: true,
    stock: 5,
    created: daysAgo(10),
    badge: "Limited",
  },
]
const slugs = (items: { slug: string }[]) => items.map((item) => item.slug.slice(categorySlug.length + 1))

let categoryId: string
const productIds: Record<string, string> = {}

beforeAll(async () => {
  const { rows } = await query<{ id: string }>(
    "INSERT INTO categories (slug, name, icon, position) VALUES ($1, $2, 'box', 999) RETURNING id",
    [categorySlug, `Test ${run}`],
  )
  categoryId = rows[0].id

  for (const f of fixtures) {
    const { rows: inserted } = await query<{ id: string }>(
      `INSERT INTO products (slug, name, brand, category_id, short_description, description, price_cents,
                             compare_at_cents, stock, rating, review_count, badge, featured, specs, created_at)
       VALUES ($1, $2, 'Testco', $3, $4, 'Long description.', $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        slug(f.key),
        f.name,
        categoryId,
        f.short ?? `Short ${f.key}`,
        f.price,
        f.compareAt,
        f.stock,
        f.rating,
        f.reviews,
        f.badge,
        f.featured,
        JSON.stringify([{ label: "Weight", value: `${f.price} g` }]),
        f.created,
      ],
    )
    productIds[f.key] = inserted[0].id
  }

  // Inserted out of order on purpose: reads must sort by position. Bravo gets no images.
  for (const [key, position] of [
    ["alpha", 1],
    ["alpha", 0],
    ["charlie", 0],
    ["delta", 0],
    ["echo", 0],
  ] as const) {
    await query(
      "INSERT INTO product_images (product_id, storage_key, width, height, alt, position) VALUES ($1, $2, 800, 600, $3, $4)",
      [productIds[key], `test/${run}/${key}-${position}.webp`, `${key} photo ${position}`, position],
    )
  }
})

afterAll(async () => {
  // Images go with their products (ON DELETE CASCADE).
  await query("DELETE FROM products WHERE category_id = $1", [categoryId])
  await query("DELETE FROM categories WHERE id = $1", [categoryId])
  await getPool().end()
})

const inCategory = (options: Parameters<typeof listProducts>[0] = {}) =>
  listProducts({ category: categorySlug, ...options })

describe("listProducts", () => {
  it("returns the category's products with card fields, featured first by default", async () => {
    const result = await inCategory()

    expect(result).toMatchObject({ page: 1, pageSize: 12, total: 5, pageCount: 1 })
    expect(slugs(result.items)).toEqual(["alpha", "echo", "charlie", "delta", "bravo"])
    expect(result.items[0]).toEqual({
      id: productIds.alpha,
      slug: slug("alpha"),
      name: `Alpha Widget ${run}`,
      brand: "Testco",
      shortDescription: "Short alpha",
      priceCents: 1000,
      compareAtCents: 1500,
      currency: "USD",
      onSale: true,
      rating: 4.5,
      reviewCount: 10,
      badge: "New",
      featured: true,
      inStock: true,
      createdAt: expect.any(Date),
      category: { slug: categorySlug, name: `Test ${run}` },
      image: {
        url: `${process.env.MEDIA_PUBLIC_URL}/test/${run}/alpha-0.webp`,
        width: 800,
        height: 600,
        alt: "alpha photo 0",
      },
    })
  })

  it("reports products without images, out of stock or not on sale", async () => {
    const { items } = await inCategory()
    const bravo = items.find((item) => item.slug === slug("bravo"))!
    const delta = items.find((item) => item.slug === slug("delta"))!

    expect(bravo).toMatchObject({ image: null, onSale: false, compareAtCents: null, badge: null })
    expect(delta).toMatchObject({ inStock: false, onSale: true })
  })

  it.each([
    ["newest", ["alpha", "delta", "charlie", "bravo", "echo"]],
    ["price-asc", ["delta", "alpha", "charlie", "bravo", "echo"]],
    ["price-desc", ["echo", "bravo", "charlie", "alpha", "delta"]],
    ["rating", ["charlie", "alpha", "delta", "bravo", "echo"]],
  ] as const)("sorts by %s", async (sort, expected) => {
    expect(slugs((await inCategory({ sort })).items)).toEqual(expected)
  })

  describe("pagination", () => {
    it("splits the results into pages without overlap", async () => {
      const first = await inCategory({ sort: "price-asc", pageSize: 2, page: 1 })
      const second = await inCategory({ sort: "price-asc", pageSize: 2, page: 2 })

      expect(first).toMatchObject({ page: 1, pageSize: 2, total: 5, pageCount: 3 })
      expect(slugs(first.items)).toEqual(["delta", "alpha"])
      expect(slugs(second.items)).toEqual(["charlie", "bravo"])
    })

    it("returns the remainder on the last page", async () => {
      const last = await inCategory({ sort: "price-asc", pageSize: 2, page: 3 })

      expect(last).toMatchObject({ page: 3, total: 5, pageCount: 3 })
      expect(slugs(last.items)).toEqual(["echo"])
    })

    it("returns no items but the real total for a page beyond the range", async () => {
      const beyond = await inCategory({ pageSize: 2, page: 4 })

      expect(beyond).toEqual({ items: [], page: 4, pageSize: 2, total: 5, pageCount: 3 })
    })

    it("fits everything on one page when the page size equals the total", async () => {
      expect(await inCategory({ pageSize: 5 })).toMatchObject({ total: 5, pageCount: 1 })
    })

    it("clamps out-of-range options from direct callers", async () => {
      const result = await inCategory({ page: 0, pageSize: 500 })

      expect(result).toMatchObject({ page: 1, pageSize: 48, total: 5 })
    })
  })

  describe("filters", () => {
    it("matches an unknown category with an empty result", async () => {
      expect(await listProducts({ category: `${categorySlug}-missing` })).toEqual({
        items: [],
        page: 1,
        pageSize: 12,
        total: 0,
        pageCount: 0,
      })
    })

    it("limits to products on sale", async () => {
      const result = await inCategory({ onSale: true, sort: "price-asc" })

      expect(slugs(result.items)).toEqual(["delta", "alpha"])
      expect(result.total).toBe(2)
    })

    it("limits to featured products, and treats false as no filter", async () => {
      expect(slugs((await inCategory({ featured: true })).items)).toEqual(["alpha", "echo"])
      expect((await inCategory({ featured: false, onSale: false })).total).toBe(5)
    })

    it("combines filters with AND", async () => {
      expect(slugs((await inCategory({ featured: true, onSale: true })).items)).toEqual(["alpha"])
    })
  })

  describe("search", () => {
    it("finds the products by a unique word across categories, case-insensitively", async () => {
      const result = await listProducts({ q: run.toUpperCase(), pageSize: 48 })

      expect(result.total).toBe(5)
      expect(result.items.every((item) => item.category.slug === categorySlug)).toBe(true)
    })

    it("requires every word to match, in any field and order", async () => {
      expect(slugs((await inCategory({ q: "widget alpha" })).items)).toEqual(["alpha"])
      expect(slugs((await inCategory({ q: "testco short charlie" })).items)).toEqual(["charlie"])
      expect((await inCategory({ q: "widget bravo" })).total).toBe(0)
    })

    it("treats % and _ as literal characters", async () => {
      expect(slugs((await inCategory({ q: "%" })).items)).toEqual(["bravo"])
      expect(slugs((await inCategory({ q: "100%" })).items)).toEqual(["bravo"])
      expect(slugs((await inCategory({ q: "_" })).items)).toEqual(["charlie"])
      expect((await inCategory({ q: "\\" })).total).toBe(0)
    })

    it("ignores a blank search", async () => {
      expect((await inCategory({ q: "   " })).total).toBe(5)
    })

    it("ranks name matches first under the default sort, but not under an explicit one", async () => {
      // Both match "delta": Delta by name, the featured Echo only by its short description.
      expect(slugs((await inCategory({ q: "delta" })).items)).toEqual(["delta", "echo"])
      expect(slugs((await inCategory({ q: "delta", sort: "price-desc" })).items)).toEqual(["echo", "delta"])
    })

    it("passes hostile input through as data", async () => {
      const result = await inCategory({ q: "'; DROP TABLE products; --" })

      expect(result.total).toBe(0)
      expect((await inCategory()).total).toBe(5)
    })
  })
})

describe("getProductBySlug", () => {
  it("returns the full product with ordered images, specs, category and related products", async () => {
    const product = await getProductBySlug(slug("alpha"))

    expect(product).toMatchObject({
      id: productIds.alpha,
      slug: slug("alpha"),
      name: `Alpha Widget ${run}`,
      description: "Long description.",
      stock: 3,
      priceCents: 1000,
      compareAtCents: 1500,
      onSale: true,
      rating: 4.5,
      category: { slug: categorySlug, name: `Test ${run}` },
      specs: [{ label: "Weight", value: "1000 g" }],
    })
    expect(product!.images.map((image) => image.alt)).toEqual(["alpha photo 0", "alpha photo 1"])
    expect(product!.images[1].url).toBe(`${process.env.MEDIA_PUBLIC_URL}/test/${run}/alpha-1.webp`)
    expect(product).not.toHaveProperty("image")
  })

  it("lists up to four related products from the same category, excluding itself", async () => {
    const product = await getProductBySlug(slug("alpha"))

    expect(slugs(product!.related)).toEqual(["echo", "charlie", "delta", "bravo"])
    expect(product!.related[0]).toMatchObject({ category: { slug: categorySlug }, image: { alt: "echo photo 0" } })
  })

  it("returns an empty image list for a product without images", async () => {
    const product = await getProductBySlug(slug("bravo"))

    expect(product!.images).toEqual([])
    expect(slugs(product!.related)).toEqual(["alpha", "echo", "charlie", "delta"])
  })

  it("returns null for an unknown slug", async () => {
    expect(await getProductBySlug(`${categorySlug}-missing`)).toBeNull()
    expect(await getProductBySlug("")).toBeNull()
  })
})
