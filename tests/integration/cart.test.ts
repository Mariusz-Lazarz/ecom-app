import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Runs the cart module against the docker compose Postgres. Only the Next.js request APIs are
// faked: the session (`auth()`) and the cookie jar (`cookies()`). Every test works on its own
// throwaway category, products and users, removed afterwards with the carts they own.
const visitor = vi.hoisted(() => ({
  userId: null as string | null,
  jar: new Map<string, { value: string; options?: Record<string, unknown> }>(),
  // Every cart id ever written to the cookie, so guest carts can be cleaned up.
  issued: new Set<string>(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({
  auth: async () => (visitor.userId ? { user: { id: visitor.userId }, expires: "2099-01-01T00:00:00.000Z" } : null),
}))
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (visitor.jar.has(name) ? { name, value: visitor.jar.get(name)!.value } : undefined),
    has: (name: string) => visitor.jar.has(name),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      visitor.jar.set(name, { value, options })
      visitor.issued.add(value)
    },
    delete: (name: string) => visitor.jar.delete(name),
  }),
}))

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const cart = await import("@/lib/cart")
const { ConflictError, NotFoundError } = await import("@/lib/errors")

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
  const slug = `cart-${run}-${productCount}`
  const { rows } = await query<{ id: string }>(
    `INSERT INTO products (slug, name, brand, category_id, short_description, description, price_cents,
                           compare_at_cents, stock)
     VALUES ($1, $2, 'Testco', $3, 'Short', 'Long description.', $4, $5, $6)
     RETURNING id`,
    [slug, `Cart product ${productCount} ${run}`, categoryId, price, compareAt, stock],
  )
  const id = rows[0].id
  if (withImage) {
    await query(
      "INSERT INTO product_images (product_id, storage_key, width, height, alt, position) VALUES ($1, $2, 800, 600, 'photo', 0)",
      [id, `test/${run}/${slug}.webp`],
    )
  }
  return { id, slug, name: `Cart product ${productCount} ${run}` }
}

async function makeUser() {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO users (first_name, last_name, email, password_hash)
     VALUES ('Cart', 'Test', $1, 'not-a-real-hash') RETURNING id`,
    [`cart-${run}-${userIds.length}@example.com`],
  )
  userIds.push(rows[0].id)
  return rows[0].id
}

const setStock = (productId: string, stock: number) =>
  query("UPDATE products SET stock = $2 WHERE id = $1", [productId, stock])

async function cartCount() {
  const { rows } = await query<{ n: number }>("SELECT count(*)::int AS n FROM carts")
  return rows[0].n
}

async function cartExists(id: string) {
  const { rowCount } = await query("SELECT 1 FROM carts WHERE id = $1", [id])
  return rowCount === 1
}

const asGuest = (cookie?: string) => {
  visitor.userId = null
  visitor.jar.clear()
  if (cookie !== undefined) visitor.jar.set(cart.CART_COOKIE, { value: cookie })
}
const asUser = (userId: string) => {
  visitor.userId = userId
}
const cookieValue = () => visitor.jar.get(cart.CART_COOKIE)?.value

beforeAll(async () => {
  const { rows } = await query<{ id: string }>(
    "INSERT INTO categories (slug, name, icon, position) VALUES ($1, $2, 'box', 999) RETURNING id",
    [`cart-${run}`, `Cart test ${run}`],
  )
  categoryId = rows[0].id
})

afterAll(async () => {
  // User carts go with their users, cart lines with their carts and products (ON DELETE CASCADE).
  await query("DELETE FROM carts WHERE id = ANY($1::uuid[]) AND user_id IS NULL", [
    [...visitor.issued].filter((id) => /^[0-9a-f-]{36}$/.test(id)),
  ])
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds])
  await query("DELETE FROM products WHERE category_id = $1", [categoryId])
  await query("DELETE FROM categories WHERE id = $1", [categoryId])
  await getPool().end()
})

beforeEach(() => asGuest())

describe("reading without a cart", () => {
  it("returns an empty cart and count without creating a cart or cookie", async () => {
    const before = await cartCount()

    expect(await cart.getCart()).toEqual({ items: [], itemCount: 0, subtotalCents: 0, savingsCents: 0, currency: "USD" })
    expect(await cart.getCartCount()).toBe(0)
    asUser(await makeUser())
    expect(await cart.getCart()).toEqual(cart.EMPTY_CART)
    expect(await cart.getCartCount()).toBe(0)

    expect(await cartCount()).toBe(before)
    expect(visitor.jar.size).toBe(0)
  })

  it("ignores a malformed or unknown cart cookie", async () => {
    asGuest("not-a-uuid")
    expect(await cart.getCart()).toEqual(cart.EMPTY_CART)
    asGuest(crypto.randomUUID())
    expect(await cart.getCartCount()).toBe(0)
  })
})

describe("addToCart", () => {
  it("creates a guest cart and sets the httpOnly cookie on the first add", async () => {
    const product = await makeProduct({ stock: 5 })

    const change = await cart.addToCart(product.id)

    expect(change).toEqual({
      productId: product.id,
      requested: 1,
      added: 1,
      quantity: 1,
      stock: 5,
      clamped: false,
      itemCount: 1,
    })
    const cookie = visitor.jar.get(cart.CART_COOKIE)!
    expect(cookie.value).toMatch(/^[0-9a-f-]{36}$/)
    expect(cookie.options).toEqual({
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    })
    expect(await cartExists(cookie.value)).toBe(true)
    expect(await cart.getCartCount()).toBe(1)
  })

  it("replaces a cookie naming an unknown cart with a new cart", async () => {
    const stale = crypto.randomUUID()
    asGuest(stale)
    const product = await makeProduct()

    await cart.addToCart(product.id, 2)

    expect(cookieValue()).not.toBe(stale)
    expect(await cartExists(cookieValue()!)).toBe(true)
    expect(await cart.getCartCount()).toBe(2)
  })

  it("adds to the existing quantity on a second add, reusing the cart", async () => {
    const product = await makeProduct()
    await cart.addToCart(product.id, 2)
    const firstCart = cookieValue()

    const change = await cart.addToCart(product.id, 3)

    expect(change).toMatchObject({ requested: 3, added: 3, quantity: 5, clamped: false, itemCount: 5 })
    expect(cookieValue()).toBe(firstCart)
    const { items } = await cart.getCart()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(5)
  })

  it("clamps to the stock and reports what was actually added", async () => {
    const product = await makeProduct({ stock: 3 })
    await cart.addToCart(product.id, 2)

    expect(await cart.addToCart(product.id, 5)).toMatchObject({
      requested: 5,
      added: 1,
      quantity: 3,
      stock: 3,
      clamped: true,
    })
    // Already at the limit: nothing more is added.
    expect(await cart.addToCart(product.id)).toMatchObject({ requested: 1, added: 0, quantity: 3, clamped: true })
  })

  it("clamps a first add above the stock", async () => {
    const product = await makeProduct({ stock: 4 })
    expect(await cart.addToCart(product.id, 10)).toMatchObject({ added: 4, quantity: 4, clamped: true })
  })

  it("clamps to 99 per line even when more is in stock", async () => {
    const product = await makeProduct({ stock: 500 })
    await cart.addToCart(product.id, 60)

    expect(await cart.addToCart(product.id, 60)).toMatchObject({ added: 39, quantity: 99, stock: 500, clamped: true })
    expect(await cart.getCartCount()).toBe(99)
  })

  it("rejects an out-of-stock product with a ConflictError and creates nothing", async () => {
    const product = await makeProduct({ stock: 0 })
    const before = await cartCount()

    const error = await cart.addToCart(product.id).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ConflictError)
    expect(error).toMatchObject({ status: 409, message: "This product is out of stock." })
    expect(await cartCount()).toBe(before)
    expect(visitor.jar.size).toBe(0)
  })

  it("rejects an unknown product with a NotFoundError and creates nothing", async () => {
    const before = await cartCount()

    const error = await cart.addToCart(crypto.randomUUID()).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error).toMatchObject({ status: 404, message: "This product no longer exists." })
    expect(await cartCount()).toBe(before)
    expect(visitor.jar.size).toBe(0)
  })

  it("keeps one cart per user under concurrent first adds", async () => {
    const userId = await makeUser()
    asUser(userId)
    const [a, b] = [await makeProduct(), await makeProduct()]

    await Promise.all([cart.addToCart(a.id), cart.addToCart(b.id), cart.addToCart(a.id)])

    const { rows } = await query<{ n: number }>("SELECT count(*)::int AS n FROM carts WHERE user_id = $1", [userId])
    expect(rows[0].n).toBe(1)
    expect(await cart.getCartCount()).toBe(3)
    // Signed-in users get no guest cookie.
    expect(visitor.jar.size).toBe(0)
  })
})

describe("setQuantity, removeFromCart and clearCart", () => {
  it("sets the quantity, clamping it to the stock", async () => {
    const product = await makeProduct({ stock: 6 })
    await cart.addToCart(product.id, 1)

    expect(await cart.setQuantity(product.id, 4)).toMatchObject({ quantity: 4, clamped: false, itemCount: 4 })
    expect(await cart.setQuantity(product.id, 50)).toMatchObject({ requested: 50, quantity: 6, stock: 6, clamped: true })
    expect((await cart.getCart()).items[0].quantity).toBe(6)
  })

  it("removes the line when the quantity is 0", async () => {
    const [keep, drop] = [await makeProduct(), await makeProduct()]
    await cart.addToCart(keep.id, 2)
    await cart.addToCart(drop.id, 3)

    expect(await cart.setQuantity(drop.id, 0)).toMatchObject({ productId: drop.id, quantity: 0, itemCount: 2 })
    expect((await cart.getCart()).items.map((item) => item.productId)).toEqual([keep.id])
  })

  it("rejects a product that isn't in the cart with a NotFoundError", async () => {
    const [inCart, other] = [await makeProduct(), await makeProduct()]
    // No cart at all yet.
    await expect(cart.setQuantity(other.id, 1)).rejects.toBeInstanceOf(NotFoundError)

    await cart.addToCart(inCart.id)
    await expect(cart.setQuantity(other.id, 1)).rejects.toMatchObject({
      status: 404,
      message: "This item isn't in your cart.",
    })
  })

  it("rejects a quantity change on a line that went out of stock", async () => {
    const product = await makeProduct({ stock: 2 })
    await cart.addToCart(product.id, 2)
    await setStock(product.id, 0)

    await expect(cart.setQuantity(product.id, 1)).rejects.toBeInstanceOf(ConflictError)
    expect((await cart.getCart()).items[0]).toMatchObject({ quantity: 2, available: false })
  })

  it("removes a line, and treats removing a missing one as a no-op", async () => {
    const [a, b] = [await makeProduct(), await makeProduct()]
    expect(await cart.removeFromCart(a.id)).toMatchObject({ quantity: 0, itemCount: 0 })

    await cart.addToCart(a.id, 1)
    await cart.addToCart(b.id, 2)
    expect(await cart.removeFromCart(a.id)).toMatchObject({ productId: a.id, quantity: 0, itemCount: 2 })
    expect(await cart.removeFromCart(a.id)).toMatchObject({ itemCount: 2 })
    expect((await cart.getCart()).items.map((item) => item.productId)).toEqual([b.id])
  })

  it("clears every line but keeps the cart and its cookie", async () => {
    const [a, b] = [await makeProduct(), await makeProduct()]
    await cart.addToCart(a.id, 1)
    await cart.addToCart(b.id, 2)
    const cartId = cookieValue()!

    await cart.clearCart()

    expect(await cart.getCart()).toEqual(cart.EMPTY_CART)
    expect(await cartExists(cartId)).toBe(true)
    expect(cookieValue()).toBe(cartId)
  })

  it("clearing without a cart does nothing", async () => {
    const before = await cartCount()
    await cart.clearCart()
    expect(await cartCount()).toBe(before)
  })
})

describe("getCart", () => {
  it("returns lines in added order with live prices, flags and totals", async () => {
    const sale = await makeProduct({ price: 1000, compareAt: 1500, stock: 10, withImage: true })
    const regular = await makeProduct({ price: 2500, stock: 10 })
    const limited = await makeProduct({ price: 300, compareAt: 400, stock: 5 })
    const soldOut = await makeProduct({ price: 9900, compareAt: 12000, stock: 3 })
    await cart.addToCart(sale.id, 2)
    await cart.addToCart(regular.id, 1)
    await cart.addToCart(limited.id, 4)
    await cart.addToCart(soldOut.id, 1)
    // Stock and prices change after the items were added; the cart reads them live.
    await setStock(limited.id, 2)
    await setStock(soldOut.id, 0)
    await query("UPDATE products SET price_cents = 2000 WHERE id = $1", [regular.id])

    const result = await cart.getCart()

    expect(result.items.map((item) => item.productId)).toEqual([sale.id, regular.id, limited.id, soldOut.id])
    expect(result.items[0]).toEqual({
      productId: sale.id,
      slug: sale.slug,
      name: sale.name,
      brand: "Testco",
      image: { url: `${process.env.MEDIA_PUBLIC_URL}/test/${run}/${sale.slug}.webp`, width: 800, height: 600, alt: "photo" },
      priceCents: 1000,
      compareAtCents: 1500,
      onSale: true,
      currency: "USD",
      quantity: 2,
      stock: 10,
      lineTotalCents: 2000,
      available: true,
      limited: false,
    })
    expect(result.items[1]).toMatchObject({ image: null, priceCents: 2000, onSale: false, lineTotalCents: 2000 })
    expect(result.items[2]).toMatchObject({ quantity: 4, stock: 2, available: true, limited: true, lineTotalCents: 1200 })
    expect(result.items[3]).toMatchObject({ quantity: 1, stock: 0, available: false, limited: false })

    // 2 + 1 + 4 + 1, unavailable lines included.
    expect(result.itemCount).toBe(8)
    expect(await cart.getCartCount()).toBe(8)
    // 2000 + 2000 + 1200; the sold-out line doesn't count.
    expect(result.subtotalCents).toBe(5200)
    // (1500 - 1000) × 2 + (400 - 300) × 4
    expect(result.savingsCents).toBe(1400)
    expect(result.currency).toBe("USD")
  })

  it("drops lines whose product is deleted", async () => {
    const [kept, deleted] = [await makeProduct(), await makeProduct()]
    await cart.addToCart(kept.id, 1)
    await cart.addToCart(deleted.id, 2)

    await query("DELETE FROM products WHERE id = $1", [deleted.id])

    const result = await cart.getCart()
    expect(result.items.map((item) => item.productId)).toEqual([kept.id])
    expect(result.itemCount).toBe(1)
    const { rowCount } = await query("SELECT 1 FROM cart_items WHERE product_id = $1", [deleted.id])
    expect(rowCount).toBe(0)
  })
})

describe("cart identity", () => {
  it("keeps users' carts apart and never opens a user's cart from a guest cookie", async () => {
    const [alice, bob] = [await makeUser(), await makeUser()]
    const product = await makeProduct()
    asUser(alice)
    await cart.addToCart(product.id, 2)
    const { rows } = await query<{ id: string }>("SELECT id FROM carts WHERE user_id = $1", [alice])
    const aliceCart = rows[0].id

    asUser(bob)
    expect(await cart.getCart()).toEqual(cart.EMPTY_CART)
    expect(await cart.getCartCount()).toBe(0)

    asGuest(aliceCart)
    expect(await cart.getCart()).toEqual(cart.EMPTY_CART)
    await cart.addToCart(product.id, 1)
    expect(cookieValue()).not.toBe(aliceCart)

    asUser(alice)
    expect(await cart.getCartCount()).toBe(2)
  })

  it("uses the user's cart and ignores a guest cookie while signed in", async () => {
    const product = await makeProduct()
    await cart.addToCart(product.id, 3)
    const guestCookie = cookieValue()

    asUser(await makeUser())
    expect(await cart.getCartCount()).toBe(0)
    await cart.addToCart(product.id, 1)
    expect(await cart.getCartCount()).toBe(1)
    expect(cookieValue()).toBe(guestCookie)
  })
})

describe("mergeGuestCart", () => {
  it("sums into the user's cart, clamps to stock and 99, then deletes the guest cart and cookie", async () => {
    const userId = await makeUser()
    const shared = await makeProduct({ stock: 5 })
    const big = await makeProduct({ stock: 500 })
    const guestOnly = await makeProduct({ stock: 10 })
    const soldOut = await makeProduct({ stock: 4 })
    asUser(userId)
    await cart.addToCart(shared.id, 3)
    await cart.addToCart(big.id, 60)

    asGuest()
    await cart.addToCart(guestOnly.id, 2)
    await cart.addToCart(shared.id, 4)
    await cart.addToCart(big.id, 70)
    await cart.addToCart(soldOut.id, 1)
    await setStock(soldOut.id, 0)
    const guestCartId = cookieValue()!

    const result = await cart.mergeGuestCart(userId)

    // shared, big and guestOnly; the sold-out line is dropped.
    expect(result).toEqual({ merged: 3 })
    expect(await cartExists(guestCartId)).toBe(false)
    expect(visitor.jar.has(cart.CART_COOKIE)).toBe(false)

    asUser(userId)
    const merged = await cart.getCart()
    expect(merged.items.map((item) => [item.productId, item.quantity])).toEqual([
      [shared.id, 5],
      [big.id, 99],
      [guestOnly.id, 2],
    ])
  })

  it("creates the user's cart when the user had none", async () => {
    const userId = await makeUser()
    const product = await makeProduct()
    await cart.addToCart(product.id, 2)

    expect(await cart.mergeGuestCart(userId)).toEqual({ merged: 1 })

    asUser(userId)
    expect(await cart.getCartCount()).toBe(2)
  })

  it("does nothing without a guest cart, and clears a stale cookie", async () => {
    const userId = await makeUser()
    const before = await cartCount()

    expect(await cart.mergeGuestCart(userId)).toEqual({ merged: 0 })

    asGuest(crypto.randomUUID())
    expect(await cart.mergeGuestCart(userId)).toEqual({ merged: 0 })
    expect(visitor.jar.has(cart.CART_COOKIE)).toBe(false)

    asGuest("garbage")
    expect(await cart.mergeGuestCart(userId)).toEqual({ merged: 0 })
    expect(visitor.jar.has(cart.CART_COOKIE)).toBe(false)

    expect(await cartCount()).toBe(before)
  })

  it("leaves the user's cart alone when the cookie already names it", async () => {
    const userId = await makeUser()
    const product = await makeProduct()
    asUser(userId)
    await cart.addToCart(product.id, 2)
    const { rows } = await query<{ id: string }>("SELECT id FROM carts WHERE user_id = $1", [userId])

    asGuest(rows[0].id)
    expect(await cart.mergeGuestCart(userId)).toEqual({ merged: 0 })

    expect(await cartExists(rows[0].id)).toBe(true)
    asUser(userId)
    expect(await cart.getCartCount()).toBe(2)
  })
})
