import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
// connection() only opts a render out of prerendering; outside a Next.js request it throws.
vi.mock("next/server", () => ({ connection: async () => {} }))

// Runs the admin product functions against the docker compose Postgres. Everything lives in a
// throwaway category (products, a user with an order and a cart) and is removed afterwards. Image
// keys are made up: the rows only reference bucket objects, nothing is uploaded.
if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const admin = await import("@/lib/admin-products")
const { ConflictError, NotFoundError, ValidationError } = await import("@/lib/errors")
const { ProductFormSchema } = await import("@/lib/validation/admin-products")
type ProductInput = import("@/lib/validation/admin-products").ProductInput

const run = Array.from({ length: 10 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")
const categorySlug = `test-admin-${run}`
const email = `admin-products-${run}@example.com`
const key = (c: string) => `products/${c.repeat(32)}.webp`
let categoryId: string

function input(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: `Trail Mug ${run}`,
    slug: `${categorySlug}-mug`,
    brand: "Halden",
    categoryId,
    shortDescription: "Enamel mug.",
    description: "A sturdy enamel mug.",
    price: 1250,
    compareAt: 1999,
    stock: 7,
    badge: "New",
    featured: true,
    specs: [
      { label: "Volume", value: "350 ml" },
      { label: "Weight", value: "250 g" },
    ],
    images: [
      { key: key("a"), width: 800, height: 600, alt: "Front" },
      { key: key("b"), width: 640, height: 480, alt: "Side" },
    ],
    ...overrides,
  }
}

const imageRows = async (productId: string) =>
  (
    await query<{ storage_key: string; width: number; height: number; alt: string; position: number }>(
      "SELECT storage_key, width, height, alt, position FROM product_images WHERE product_id = $1 ORDER BY position",
      [productId],
    )
  ).rows

beforeAll(async () => {
  const { rows } = await query<{ id: string }>(
    "INSERT INTO categories (slug, name, icon, position) VALUES ($1, $2, 'package', 999) RETURNING id",
    [categorySlug, `Test ${run}`],
  )
  categoryId = rows[0].id
})

afterAll(async () => {
  await query("DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email = $1)", [email])
  await query("DELETE FROM users WHERE email = $1", [email])
  await query("DELETE FROM products WHERE category_id = $1", [categoryId])
  await query("DELETE FROM categories WHERE id = $1", [categoryId])
  await getPool().end()
})

describe("createProduct", () => {
  it("stores the product, its specs and its images in order", async () => {
    const { id, slug } = await admin.createProduct(input({ slug: `${categorySlug}-create` }))

    expect(slug).toBe(`${categorySlug}-create`)
    const product = await admin.getAdminProduct(id)
    expect(product).toMatchObject({
      id,
      slug,
      name: `Trail Mug ${run}`,
      brand: "Halden",
      categoryId,
      priceCents: 1250,
      compareAtCents: 1999,
      currency: "USD",
      stock: 7,
      rating: 0,
      reviewCount: 0,
      badge: "New",
      featured: true,
      specs: [
        { label: "Volume", value: "350 ml" },
        { label: "Weight", value: "250 g" },
      ],
      orderLineCount: 0,
    })
    expect(product!.images.map(({ key, width, height, alt }) => ({ key, width, height, alt }))).toEqual([
      { key: key("a"), width: 800, height: 600, alt: "Front" },
      { key: key("b"), width: 640, height: 480, alt: "Side" },
    ])
    expect(product!.images[0].url).toMatch(new RegExp(`/${key("a")}$`))
    expect((await imageRows(id)).map((row) => row.position)).toEqual([0, 1])
  })

  it("creates a product without images or specs", async () => {
    const { id } = await admin.createProduct(
      input({ slug: `${categorySlug}-bare`, images: [], specs: [], compareAt: null, badge: null }),
    )

    const product = await admin.getAdminProduct(id)
    expect(product).toMatchObject({ images: [], specs: [], compareAtCents: null, badge: null })
  })

  it("rejects a taken slug as a ConflictError on the slug field and stores nothing", async () => {
    await admin.createProduct(input({ slug: `${categorySlug}-taken` }))

    const err = await admin.createProduct(input({ slug: `${categorySlug}-taken`, name: "Other" })).catch((e) => e)

    expect(err).toBeInstanceOf(admin.SlugTakenError)
    expect(err).toBeInstanceOf(ConflictError)
    expect(err).toMatchObject({ status: 409, field: "slug", message: "Another product already uses this slug." })
    const { rows } = await query("SELECT 1 FROM products WHERE slug = $1", [`${categorySlug}-taken`])
    expect(rows).toHaveLength(1)
  })

  it.each([
    ["equal to", 1250],
    ["below", 1000],
  ])("rejects a compare-at price %s the price before writing", async (_, compareAt) => {
    const slug = `${categorySlug}-compare-${compareAt}`
    const err = await admin.createProduct(input({ slug, compareAt })).catch((e) => e)

    expect(err).toBeInstanceOf(ValidationError)
    expect(err.fieldErrors).toEqual({ compareAt: ["Compare-at price must be higher than the price, or empty."] })
    expect((await query("SELECT 1 FROM products WHERE slug = $1", [slug])).rows).toHaveLength(0)
  })

  it("reports a missing category on the category field", async () => {
    const err = await admin
      .createProduct(input({ slug: `${categorySlug}-nocat`, categoryId: "00000000-0000-4000-8000-000000000000" }))
      .catch((e) => e)

    expect(err).toBeInstanceOf(ValidationError)
    expect(err.fieldErrors).toEqual({ categoryId: ["This category no longer exists."] })
  })

  it("accepts what the form schema produces", async () => {
    const parsed = ProductFormSchema.parse({
      name: "Schema Mug",
      slug: `${categorySlug}-schema`,
      brand: "Halden",
      categoryId,
      shortDescription: "Short.",
      description: "Long.",
      price: "9.99",
      compareAt: "",
      stock: "0",
      badge: "",
      featured: false,
      specs: [],
      images: [{ key: key("c"), width: 10, height: 10, alt: "" }],
    })
    const { id } = await admin.createProduct(parsed)

    expect((await imageRows(id))[0]).toMatchObject({ storage_key: key("c"), alt: "Schema Mug", position: 0 })
  })
})

describe("updateProduct", () => {
  it("overwrites the fields and replaces the images in the new order, keeping rating and reviews", async () => {
    const { id } = await admin.createProduct(input({ slug: `${categorySlug}-update` }))
    await query("UPDATE products SET rating = 4.5, review_count = 12 WHERE id = $1", [id])

    const result = await admin.updateProduct(
      id,
      input({
        slug: `${categorySlug}-updated`,
        name: "Renamed Mug",
        price: 1500,
        compareAt: null,
        stock: 0,
        featured: false,
        badge: null,
        specs: [{ label: "Colour", value: "Green" }],
        images: [
          { key: key("b"), width: 640, height: 480, alt: "Side, now primary" },
          { key: key("d"), width: 300, height: 300, alt: "New" },
        ],
      }),
    )

    expect(result).toEqual({ id, slug: `${categorySlug}-updated` })
    expect(await admin.getAdminProduct(id)).toMatchObject({
      slug: `${categorySlug}-updated`,
      name: "Renamed Mug",
      priceCents: 1500,
      compareAtCents: null,
      stock: 0,
      featured: false,
      badge: null,
      rating: 4.5,
      reviewCount: 12,
      specs: [{ label: "Colour", value: "Green" }],
    })
    expect(await imageRows(id)).toEqual([
      { storage_key: key("b"), width: 640, height: 480, alt: "Side, now primary", position: 0 },
      { storage_key: key("d"), width: 300, height: 300, alt: "New", position: 1 },
    ])
  })

  it("removes every image when given none", async () => {
    const { id } = await admin.createProduct(input({ slug: `${categorySlug}-noimg` }))

    await admin.updateProduct(id, input({ slug: `${categorySlug}-noimg`, images: [] }))

    expect(await imageRows(id)).toEqual([])
  })

  it("rejects another product's slug and leaves the product and its images untouched", async () => {
    await admin.createProduct(input({ slug: `${categorySlug}-first` }))
    const { id } = await admin.createProduct(input({ slug: `${categorySlug}-second` }))

    const err = await admin
      .updateProduct(id, input({ slug: `${categorySlug}-first`, images: [{ key: key("e"), width: 1, height: 1, alt: "x" }] }))
      .catch((e) => e)

    expect(err).toBeInstanceOf(admin.SlugTakenError)
    expect((await admin.getAdminProduct(id))!.slug).toBe(`${categorySlug}-second`)
    expect((await imageRows(id)).map((row) => row.storage_key)).toEqual([key("a"), key("b")])
  })

  it("throws NotFoundError for an unknown id", async () => {
    await expect(
      admin.updateProduct("00000000-0000-4000-8000-000000000000", input({ slug: `${categorySlug}-ghost` })),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("deleteProduct", () => {
  it("removes the product, its images and cart lines, and keeps order lines with product_id NULL", async () => {
    const { id, slug } = await admin.createProduct(input({ slug: `${categorySlug}-delete` }))
    const { rows: users } = await query<{ id: string }>(
      "INSERT INTO users (first_name, last_name, email, password_hash) VALUES ('Ada', 'Lovelace', $1, 'x') RETURNING id",
      [email],
    )
    const userId = users[0].id
    const { rows: carts } = await query<{ id: string }>("INSERT INTO carts (user_id) VALUES ($1) RETURNING id", [userId])
    await query("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 2)", [carts[0].id, id])
    const { rows: orders } = await query<{ id: string }>(
      `INSERT INTO orders (user_id, full_name, line1, city, postal_code, country, phone,
                           shipping_method_id, shipping_method_name, shipping_method_price_cents,
                           payment_method_id, payment_method_name, subtotal_cents, shipping_cents, total_cents)
       VALUES ($1, 'Ada', '1 Row', 'London', 'E1', 'GB', '+44', 'standard', 'Standard', 0, 'cards', 'Cards', 1250, 0, 1250)
       RETURNING id`,
      [userId],
    )
    await query(
      `INSERT INTO order_items (order_id, product_id, position, product_name, product_slug, brand, image_key,
                                unit_price_cents, quantity, line_total_cents)
       VALUES ($1, $2, 0, $3, $4, 'Halden', $5, 1250, 1, 1250)`,
      [orders[0].id, id, `Trail Mug ${run}`, slug, key("a")],
    )
    expect((await admin.getAdminProduct(id))!.orderLineCount).toBe(1)

    expect(await admin.deleteProduct(id)).toEqual({ id, slug, name: `Trail Mug ${run}` })

    expect(await admin.getAdminProduct(id)).toBeNull()
    expect(await imageRows(id)).toEqual([])
    expect((await query("SELECT 1 FROM cart_items WHERE cart_id = $1", [carts[0].id])).rows).toHaveLength(0)
    const { rows: items } = await query("SELECT product_id, product_name, product_slug, image_key FROM order_items WHERE order_id = $1", [
      orders[0].id,
    ])
    expect(items).toEqual([{ product_id: null, product_name: `Trail Mug ${run}`, product_slug: slug, image_key: key("a") }])
  })

  it("throws NotFoundError for an unknown id", async () => {
    await expect(admin.deleteProduct("00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("listAdminProducts and listLowStockProducts", () => {
  let ids: Record<string, string>

  beforeAll(async () => {
    ids = {}
    for (const [name, stock] of [
      ["Zebra Lamp", 50],
      ["Amber Lamp", 3],
      ["Cedar Stool", 0],
      ["Birch Stool", 10],
      ["Oak Stool", 11],
    ] as const) {
      const slug = `${categorySlug}-list-${name.toLowerCase().replace(" ", "-")}`
      ids[name] = (await admin.createProduct(input({ name: `${name} ${run}`, slug, brand: "Listco", stock, images: [] }))).id
    }
  })

  const names = (items: { name: string }[]) => items.map((item) => item.name.replace(` ${run}`, ""))

  it("searches name, brand and slug case-insensitively, within a category", async () => {
    const byName = await admin.listAdminProducts({ q: "STOOL", category: categorySlug })
    expect(names(byName.items).sort()).toEqual(["Birch Stool", "Cedar Stool", "Oak Stool"])

    const bySlug = await admin.listAdminProducts({ q: `${categorySlug}-list-zebra` })
    expect(names(bySlug.items)).toEqual(["Zebra Lamp"])

    const byBrand = await admin.listAdminProducts({ q: "listco", category: categorySlug })
    expect(byBrand.total).toBe(5)
  })

  it("treats LIKE wildcards in the search literally", async () => {
    expect((await admin.listAdminProducts({ q: "%", category: categorySlug })).total).toBe(0)
  })

  it("filters low stock (≤ 10), lowest first", async () => {
    const list = await admin.listAdminProducts({ category: categorySlug, stock: "low", q: "listco" })
    expect(names(list.items)).toEqual(["Cedar Stool", "Amber Lamp", "Birch Stool"])
    expect(list.items.map((item) => item.stock)).toEqual([0, 3, 10])
    expect(list.items[0]).toMatchObject({ id: ids["Cedar Stool"], category: { slug: categorySlug }, image: null })
  })

  it("paginates", async () => {
    const page2 = await admin.listAdminProducts({ q: "listco", category: categorySlug, pageSize: 2, page: 2 })
    expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 5, pageCount: 3 })
    expect(page2.items).toHaveLength(2)
    const page4 = await admin.listAdminProducts({ q: "listco", category: categorySlug, pageSize: 2, page: 4 })
    expect(page4.items).toEqual([])
  })

  it("lists the lowest-stock products across the shop", async () => {
    const low = await admin.listLowStockProducts(100)
    expect(low.every((item) => item.stock <= 10)).toBe(true)
    expect(low.map((item) => item.stock)).toEqual([...low.map((item) => item.stock)].sort((a, b) => a - b))
    expect(low.map((item) => item.id)).toEqual(expect.arrayContaining([ids["Cedar Stool"], ids["Amber Lamp"], ids["Birch Stool"]]))
    expect(low.map((item) => item.id)).not.toContain(ids["Oak Stool"])
    expect(await admin.listLowStockProducts(2)).toHaveLength(2)
  })
})
