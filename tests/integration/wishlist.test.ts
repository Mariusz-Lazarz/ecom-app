import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Runs the wishlist module against the docker compose Postgres. Only the session (`auth()`) is
// faked. Every test works on its own throwaway category, products and users, removed afterwards
// along with their wishlist rows (ON DELETE CASCADE).
const visitor = vi.hoisted(() => ({ userId: null as string | null }))

vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({
  auth: async () => (visitor.userId ? { user: { id: visitor.userId }, expires: "2099-01-01T00:00:00.000Z" } : null),
}))

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const wishlist = await import("@/lib/wishlist")
const { NotFoundError } = await import("@/lib/errors")

const run = Array.from({ length: 10 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")
let categoryId: string
const userIds: string[] = []
let productCount = 0

async function makeProduct({
  price = 1000,
  compareAt = null,
  stock = 10,
  withImage = false,
}: { price?: number; compareAt?: number | null; stock?: number; withImage?: boolean } = {}) {
  productCount += 1
  const slug = `wish-${run}-${productCount}`
  const name = `Wish product ${productCount} ${run}`
  const { rows } = await query<{ id: string }>(
    `INSERT INTO products (slug, name, brand, category_id, short_description, description, price_cents,
                           compare_at_cents, stock)
     VALUES ($1, $2, 'Testco', $3, 'Short', 'Long description.', $4, $5, $6)
     RETURNING id`,
    [slug, name, categoryId, price, compareAt, stock],
  )
  const id = rows[0].id
  if (withImage) {
    await query(
      "INSERT INTO product_images (product_id, storage_key, width, height, alt, position) VALUES ($1, $2, 800, 600, 'photo', 0)",
      [id, `test/${run}/${slug}.webp`],
    )
  }
  return { id, slug, name }
}

async function makeUser() {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO users (first_name, last_name, email, password_hash)
     VALUES ('Wish', 'Test', $1, 'not-a-real-hash') RETURNING id`,
    [`wish-${run}-${userIds.length}@example.com`],
  )
  userIds.push(rows[0].id)
  return rows[0].id
}

async function rowCount(userId: string) {
  const { rows } = await query<{ n: number }>("SELECT count(*)::int AS n FROM wishlist_items WHERE user_id = $1", [
    userId,
  ])
  return rows[0].n
}

beforeAll(async () => {
  const { rows } = await query<{ id: string }>(
    "INSERT INTO categories (slug, name, icon, position) VALUES ($1, $2, 'box', 999) RETURNING id",
    [`wish-${run}`, `Wishlist test ${run}`],
  )
  categoryId = rows[0].id
})

afterAll(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds])
  await query("DELETE FROM products WHERE category_id = $1", [categoryId])
  await query("DELETE FROM categories WHERE id = $1", [categoryId])
  await getPool().end()
})

beforeEach(() => {
  visitor.userId = null
})

describe("addToWishlist", () => {
  it("saves a product once: a second add is a no-op that keeps one row", async () => {
    const user = await makeUser()
    const product = await makeProduct()

    expect(await wishlist.addToWishlist(user, product.id)).toEqual({ added: true })
    const [{ addedAt }] = await wishlist.listWishlist(user)
    expect(await wishlist.addToWishlist(user, product.id)).toEqual({ added: false })

    expect(await rowCount(user)).toBe(1)
    expect((await wishlist.listWishlist(user))[0].addedAt).toEqual(addedAt)
  })

  it("throws NotFoundError for a product that doesn't exist, writing nothing", async () => {
    const user = await makeUser()

    await expect(wishlist.addToWishlist(user, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(await rowCount(user)).toBe(0)
  })
})

describe("removeFromWishlist", () => {
  it("removes a saved product and reports it", async () => {
    const user = await makeUser()
    const keep = await makeProduct()
    const drop = await makeProduct()
    await wishlist.addToWishlist(user, keep.id)
    await wishlist.addToWishlist(user, drop.id)

    expect(await wishlist.removeFromWishlist(user, drop.id)).toEqual({ removed: true })
    expect((await wishlist.listWishlist(user)).map((item) => item.productId)).toEqual([keep.id])
  })

  it("is a no-op for a product that isn't saved", async () => {
    const user = await makeUser()
    const product = await makeProduct()

    expect(await wishlist.removeFromWishlist(user, product.id)).toEqual({ removed: false })
  })
})

describe("toggleWishlist", () => {
  it("saves, then unsaves, then saves again", async () => {
    const user = await makeUser()
    const product = await makeProduct()

    expect(await wishlist.toggleWishlist(user, product.id)).toEqual({ saved: true })
    expect(await rowCount(user)).toBe(1)
    expect(await wishlist.toggleWishlist(user, product.id)).toEqual({ saved: false })
    expect(await rowCount(user)).toBe(0)
    expect(await wishlist.toggleWishlist(user, product.id)).toEqual({ saved: true })
    expect(await rowCount(user)).toBe(1)
  })

  it("throws NotFoundError when saving a missing product", async () => {
    const user = await makeUser()

    await expect(wishlist.toggleWishlist(user, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})

describe("listWishlist", () => {
  it("returns an empty list for a user with nothing saved", async () => {
    expect(await wishlist.listWishlist(await makeUser())).toEqual([])
  })

  it("lists newest first with live price, sale, stock and the primary image", async () => {
    const user = await makeUser()
    const first = await makeProduct({ price: 2500, withImage: true })
    const second = await makeProduct({ price: 1500, compareAt: 2000, stock: 0 })
    await wishlist.addToWishlist(user, first.id)
    await wishlist.addToWishlist(user, second.id)
    // Prices and stock are read live, not copied when saved.
    await query("UPDATE products SET price_cents = 1999, stock = 4 WHERE id = $1", [first.id])

    const items = await wishlist.listWishlist(user)

    expect(items.map((item) => item.productId)).toEqual([second.id, first.id])
    expect(items[0]).toMatchObject({
      slug: second.slug,
      name: second.name,
      brand: "Testco",
      image: null,
      priceCents: 1500,
      compareAtCents: 2000,
      onSale: true,
      currency: "USD",
      stock: 0,
      inStock: false,
    })
    expect(items[1]).toMatchObject({ priceCents: 1999, compareAtCents: null, onSale: false, stock: 4, inStock: true })
    expect(items[1].image).toMatchObject({ width: 800, height: 600, alt: "photo" })
    expect(items[1].image!.url).toMatch(new RegExp(`/test/${run}/${first.slug}\\.webp$`))
    expect(items[1].addedAt).toBeInstanceOf(Date)
  })
})

describe("countWishlist and getWishlistCount", () => {
  it("counts the user's saved products", async () => {
    const user = await makeUser()
    expect(await wishlist.countWishlist(user)).toBe(0)

    for (let i = 0; i < 3; i++) await wishlist.addToWishlist(user, (await makeProduct()).id)

    expect(await wishlist.countWishlist(user)).toBe(3)
    visitor.userId = user
    expect(await wishlist.getWishlistCount()).toBe(3)
  })

  it("is 0 for a guest", async () => {
    expect(await wishlist.getWishlistCount()).toBe(0)
  })
})

describe("listWishlistedIds and getWishlistedIds", () => {
  it("returns which of the given products are saved, in one batch", async () => {
    const user = await makeUser()
    const [a, b, c] = [await makeProduct(), await makeProduct(), await makeProduct()]
    await wishlist.addToWishlist(user, a.id)
    await wishlist.addToWishlist(user, c.id)

    expect(await wishlist.listWishlistedIds(user, [a.id, b.id, c.id])).toEqual(new Set([a.id, c.id]))
    expect(await wishlist.listWishlistedIds(user, [b.id])).toEqual(new Set())
    expect(await wishlist.listWishlistedIds(user, [])).toEqual(new Set())

    visitor.userId = user
    expect(await wishlist.getWishlistedIds([a.id, b.id])).toEqual(new Set([a.id]))
  })

  it("is null for a guest", async () => {
    const product = await makeProduct()
    expect(await wishlist.getWishlistedIds([product.id])).toBeNull()
  })
})

describe("isolation and cascades", () => {
  it("keeps each user's wishlist to themselves", async () => {
    const anna = await makeUser()
    const ben = await makeUser()
    const product = await makeProduct()
    await wishlist.addToWishlist(anna, product.id)

    expect(await wishlist.listWishlist(ben)).toEqual([])
    expect(await wishlist.countWishlist(ben)).toBe(0)
    expect(await wishlist.listWishlistedIds(ben, [product.id])).toEqual(new Set())
    expect(await wishlist.removeFromWishlist(ben, product.id)).toEqual({ removed: false })
    expect(await wishlist.toggleWishlist(ben, product.id)).toEqual({ saved: true })

    expect(await wishlist.countWishlist(anna)).toBe(1)
    expect(await wishlist.countWishlist(ben)).toBe(1)
  })

  it("drops a product from every wishlist when it is deleted", async () => {
    const anna = await makeUser()
    const ben = await makeUser()
    const gone = await makeProduct()
    const kept = await makeProduct()
    for (const user of [anna, ben]) {
      await wishlist.addToWishlist(user, gone.id)
      await wishlist.addToWishlist(user, kept.id)
    }

    await query("DELETE FROM products WHERE id = $1", [gone.id])

    expect((await wishlist.listWishlist(anna)).map((item) => item.productId)).toEqual([kept.id])
    expect(await wishlist.countWishlist(ben)).toBe(1)
  })

  it("drops a user's wishlist when the user is deleted", async () => {
    const user = await makeUser()
    await wishlist.addToWishlist(user, (await makeProduct()).id)

    await query("DELETE FROM users WHERE id = $1", [user])

    expect(await rowCount(user)).toBe(0)
  })
})
