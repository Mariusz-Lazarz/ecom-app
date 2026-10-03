import "server-only"

import { cookies } from "next/headers"

import { auth } from "@/auth"
import { query, withTransaction } from "@/lib/db"
import { ConflictError, NotFoundError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import type { ProductImage } from "@/lib/products"
import { mediaUrl } from "@/lib/storage"
import { MAX_LINE_QUANTITY } from "@/lib/validation/cart"

/**
 * The shopping cart, stored in Postgres for guests and signed-in users alike.
 *
 * Whose cart a request works on: a signed-in user's own cart (`carts.user_id`, one per user);
 * otherwise the guest cart named by the httpOnly `cart_id` cookie. A cookie that isn't a uuid, or
 * names an unknown cart or one that belongs to a user, is ignored. Nothing is created until the
 * first add: without a cart, reads return an empty cart.
 *
 * Lines hold only product and quantity. Prices, sale state and stock are read live from products,
 * and quantities are clamped to min(stock, 99) whenever they are written. A later stock drop is
 * not written back; `getCart()` flags those lines instead.
 *
 * Every function reads the session and cookies, so they only work inside a request (Server
 * Components, Server Actions, Route Handlers). Reading cookies already keeps a render dynamic.
 */

const log = logger.child({ scope: "cart" })

export const CART_COOKIE = "cart_id"
const CART_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days, renewed on every add
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_CURRENCY = "USD"

export type CartItem = {
  productId: string
  slug: string
  name: string
  brand: string
  // The primary image (position 0), or null when the product has none.
  image: ProductImage | null
  priceCents: number
  compareAtCents: number | null
  onSale: boolean
  currency: string
  quantity: number
  stock: number
  // priceCents × quantity.
  lineTotalCents: number
  // false when the product is out of stock (stock 0); such lines don't count towards the totals.
  available: boolean
  // true when the line asks for more than is in stock (stock dropped after it was added).
  limited: boolean
}

export type Cart = {
  // In the order they were first added.
  items: CartItem[]
  // Sum of all quantities, including unavailable lines; the same number getCartCount() returns.
  itemCount: number
  // Sum of the available lines' totals.
  subtotalCents: number
  // What the available on-sale lines save against their compare-at price.
  savingsCents: number
  // The first line's currency, or USD for an empty cart.
  currency: string
}

/** What a write did to one line. */
export type CartLineChange = {
  productId: string
  // The quantity that was asked for (the amount to add, for addToCart).
  requested: number
  // How many units addToCart actually added; 0 when the line was already at its limit.
  added: number
  // The line's quantity now; 0 when it was removed.
  quantity: number
  stock: number
  // true when the result was capped by stock or the 99-per-line limit.
  clamped: boolean
  // The cart's item count after the change, for the header badge.
  itemCount: number
}

export const EMPTY_CART: Cart = { items: [], itemCount: 0, subtotalCents: 0, savingsCents: 0, currency: DEFAULT_CURRENCY }

type Owner = { userId: string } | { guestCartId: string | null }

async function currentOwner(): Promise<Owner> {
  const session = await auth()
  const userId = session?.user?.id
  if (userId) return { userId }
  return { guestCartId: await readGuestCookie() }
}

async function readGuestCookie() {
  const value = (await cookies()).get(CART_COOKIE)?.value
  return value && UUID.test(value) ? value.toLowerCase() : null
}

async function writeGuestCookie(cartId: string) {
  ;(await cookies()).set(CART_COOKIE, cartId, {
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

async function deleteGuestCookie() {
  const store = await cookies()
  if (store.has(CART_COOKIE)) store.delete(CART_COOKIE)
}

/** The current cart's id, or null when there is none yet. A guest cookie never opens a user's cart. */
async function findCartId(owner: Owner): Promise<string | null> {
  if ("userId" in owner) {
    const { rows } = await query<{ id: string }>("SELECT id FROM carts WHERE user_id = $1", [owner.userId])
    return rows[0]?.id ?? null
  }
  if (!owner.guestCartId) return null
  const { rows } = await query<{ id: string }>("SELECT id FROM carts WHERE id = $1 AND user_id IS NULL", [
    owner.guestCartId,
  ])
  return rows[0]?.id ?? null
}

/** The current cart's id, creating the cart (and, for a guest, the cookie) if there is none. */
async function ensureCartId(owner: Owner): Promise<string> {
  if ("userId" in owner) {
    // The upsert makes two concurrent first adds end up in the same cart.
    const { rows } = await query<{ id: string }>(
      `INSERT INTO carts (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [owner.userId],
    )
    return rows[0].id
  }

  let cartId = await findCartId(owner)
  if (cartId) {
    await touch(cartId)
  } else {
    const { rows } = await query<{ id: string }>("INSERT INTO carts DEFAULT VALUES RETURNING id")
    cartId = rows[0].id
    log.info("Guest cart created", { cartId })
  }
  await writeGuestCookie(cartId)
  return cartId
}

async function touch(cartId: string) {
  await query("UPDATE carts SET updated_at = now() WHERE id = $1", [cartId])
}

async function countItems(cartId: string) {
  const { rows } = await query<{ count: number }>(
    "SELECT COALESCE(SUM(quantity), 0)::int AS count FROM cart_items WHERE cart_id = $1",
    [cartId],
  )
  return rows[0].count
}

type CartRow = {
  product_id: string
  quantity: number
  slug: string
  name: string
  brand: string
  price_cents: number
  compare_at_cents: number | null
  currency: string
  stock: number
  image_key: string | null
  image_width: number | null
  image_height: number | null
  image_alt: string | null
}

function toCartItem(row: CartRow): CartItem {
  return {
    productId: row.product_id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    image:
      row.image_key === null
        ? null
        : { url: mediaUrl(row.image_key), width: row.image_width!, height: row.image_height!, alt: row.image_alt! },
    priceCents: row.price_cents,
    compareAtCents: row.compare_at_cents,
    onSale: row.compare_at_cents !== null && row.compare_at_cents > row.price_cents,
    currency: row.currency,
    quantity: row.quantity,
    stock: row.stock,
    lineTotalCents: row.price_cents * row.quantity,
    available: row.stock > 0,
    limited: row.stock > 0 && row.quantity > row.stock,
  }
}

/** The current visitor's cart with live prices and stock. Never creates anything. */
export async function getCart(): Promise<Cart> {
  const cartId = await findCartId(await currentOwner())
  if (!cartId) return EMPTY_CART

  const { rows } = await query<CartRow>(
    `SELECT ci.product_id, ci.quantity, p.slug, p.name, p.brand, p.price_cents, p.compare_at_cents,
            p.currency, p.stock,
            img.storage_key AS image_key, img.width AS image_width, img.height AS image_height, img.alt AS image_alt
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN LATERAL (
       SELECT storage_key, width, height, alt FROM product_images
       WHERE product_id = p.id ORDER BY position LIMIT 1
     ) img ON true
     WHERE ci.cart_id = $1
     ORDER BY ci.added_at, ci.product_id`,
    [cartId],
  )

  const items = rows.map(toCartItem)
  let itemCount = 0
  let subtotalCents = 0
  let savingsCents = 0
  for (const item of items) {
    itemCount += item.quantity
    if (!item.available) continue
    subtotalCents += item.lineTotalCents
    if (item.onSale) savingsCents += (item.compareAtCents! - item.priceCents) * item.quantity
  }

  return { items, itemCount, subtotalCents, savingsCents, currency: items[0]?.currency ?? DEFAULT_CURRENCY }
}

/** Sum of quantities in the current cart (0 without one): one query, for the header badge. */
export async function getCartCount(): Promise<number> {
  const owner = await currentOwner()
  if ("userId" in owner) {
    const { rows } = await query<{ count: number }>(
      `SELECT COALESCE(SUM(ci.quantity), 0)::int AS count
       FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
       WHERE c.user_id = $1`,
      [owner.userId],
    )
    return rows[0].count
  }
  if (!owner.guestCartId) return 0
  const { rows } = await query<{ count: number }>(
    `SELECT COALESCE(SUM(ci.quantity), 0)::int AS count
     FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
     WHERE c.id = $1 AND c.user_id IS NULL`,
    [owner.guestCartId],
  )
  return rows[0].count
}

/**
 * Adds `quantity` units of a product, on top of what the cart already holds, capped at
 * min(stock, 99). Creates the cart (and the guest cookie) on the first add.
 *
 * @throws NotFoundError when the product doesn't exist.
 * @throws ConflictError when the product is out of stock.
 */
export async function addToCart(productId: string, quantity = 1): Promise<CartLineChange> {
  const { rows: products } = await query<{ stock: number }>("SELECT stock FROM products WHERE id = $1", [productId])
  if (!products[0]) throw new NotFoundError("This product no longer exists.")
  if (products[0].stock <= 0) throw new ConflictError("This product is out of stock.")

  const cartId = await ensureCartId(await currentOwner())

  // Clamping happens in the statement against the live stock, so concurrent adds can't overshoot.
  // `previous` is read before the write and only feeds the "added" figure shown to the user.
  const { rows } = await query<{ quantity: number; stock: number; previous: number }>(
    `WITH product AS (SELECT id, stock FROM products WHERE id = $2 AND stock > 0),
          prev AS (SELECT quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2)
     INSERT INTO cart_items AS ci (cart_id, product_id, quantity)
     SELECT $1, product.id, LEAST($3::int, product.stock, ${MAX_LINE_QUANTITY}) FROM product
     ON CONFLICT (cart_id, product_id) DO UPDATE
       SET quantity = LEAST(ci.quantity + $3::int, (SELECT stock FROM product), ${MAX_LINE_QUANTITY})
     RETURNING ci.quantity, (SELECT stock FROM product) AS stock, COALESCE((SELECT quantity FROM prev), 0) AS previous`,
    [cartId, productId, quantity],
  )
  // The product sold out or was deleted between the check above and the write.
  if (!rows[0]) throw new ConflictError("This product is out of stock.")

  const { quantity: newQuantity, stock, previous } = rows[0]
  const added = Math.max(0, newQuantity - previous)
  return {
    productId,
    requested: quantity,
    added,
    quantity: newQuantity,
    stock,
    clamped: added < quantity,
    itemCount: await countItems(cartId),
  }
}

/**
 * Sets a line's quantity, capped at min(stock, 99). 0 removes the line.
 *
 * @throws NotFoundError when the product isn't in the cart.
 * @throws ConflictError when the product is out of stock (remove the line instead).
 */
export async function setQuantity(productId: string, quantity: number): Promise<CartLineChange> {
  if (quantity <= 0) return removeFromCart(productId)

  const cartId = await findCartId(await currentOwner())
  if (!cartId) throw new NotFoundError("This item isn't in your cart.")

  const { rows } = await query<{ quantity: number; stock: number }>(
    `UPDATE cart_items ci
     SET quantity = LEAST($3::int, p.stock, ${MAX_LINE_QUANTITY})
     FROM products p
     WHERE ci.cart_id = $1 AND ci.product_id = $2 AND p.id = ci.product_id AND p.stock > 0
     RETURNING ci.quantity, p.stock`,
    [cartId, productId, quantity],
  )
  if (!rows[0]) {
    const { rowCount } = await query("SELECT 1 FROM cart_items WHERE cart_id = $1 AND product_id = $2", [
      cartId,
      productId,
    ])
    if (rowCount) throw new ConflictError("This product is out of stock.")
    throw new NotFoundError("This item isn't in your cart.")
  }
  await touch(cartId)

  return {
    productId,
    requested: quantity,
    added: 0,
    quantity: rows[0].quantity,
    stock: rows[0].stock,
    clamped: rows[0].quantity < quantity,
    itemCount: await countItems(cartId),
  }
}

/** Removes a line. Removing something that isn't in the cart is a no-op. */
export async function removeFromCart(productId: string): Promise<CartLineChange> {
  const cartId = await findCartId(await currentOwner())
  const change = { productId, requested: 0, added: 0, quantity: 0, stock: 0, clamped: false, itemCount: 0 }
  if (!cartId) return change

  await query("DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2", [cartId, productId])
  await touch(cartId)
  return { ...change, itemCount: await countItems(cartId) }
}

/** Empties the cart. The cart itself (and a guest's cookie) stays. */
export async function clearCart(): Promise<void> {
  const cartId = await findCartId(await currentOwner())
  if (!cartId) return
  await query("DELETE FROM cart_items WHERE cart_id = $1", [cartId])
  await touch(cartId)
}

/**
 * Moves the guest cart named by the cookie into `userId`'s cart, right after sign-in: quantities of
 * the same product are summed and capped at min(stock, 99), out-of-stock guest lines are dropped.
 * Then deletes the guest cart and the cookie. Does nothing (besides clearing a stale cookie) when
 * there's no guest cart, or the cookie names a cart that already belongs to a user.
 *
 * Returns how many guest lines were merged.
 */
export async function mergeGuestCart(userId: string): Promise<{ merged: number }> {
  const guestCartId = await readGuestCookie()
  if (!guestCartId) {
    await deleteGuestCookie()
    return { merged: 0 }
  }

  const merged = await withTransaction(async (client) => {
    // Locking the guest cart makes a second, concurrent merge of the same cart find nothing.
    const guest = await client.query("SELECT id FROM carts WHERE id = $1 AND user_id IS NULL FOR UPDATE", [
      guestCartId,
    ])
    if (!guest.rowCount) return 0

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO carts (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [userId],
    )
    const userCartId = rows[0].id

    const moved = await client.query(
      `INSERT INTO cart_items AS ci (cart_id, product_id, quantity, added_at)
       SELECT $1, g.product_id, LEAST(g.quantity, p.stock, ${MAX_LINE_QUANTITY}), g.added_at
       FROM cart_items g JOIN products p ON p.id = g.product_id
       WHERE g.cart_id = $2 AND p.stock > 0
       ON CONFLICT (cart_id, product_id) DO UPDATE
         SET quantity = LEAST(
           ci.quantity + EXCLUDED.quantity,
           (SELECT stock FROM products WHERE id = EXCLUDED.product_id),
           ${MAX_LINE_QUANTITY}
         )`,
      [userCartId, guestCartId],
    )
    await client.query("DELETE FROM carts WHERE id = $1", [guestCartId])
    return moved.rowCount ?? 0
  })

  await deleteGuestCookie()
  if (merged) log.info("Guest cart merged", { userId, merged })
  return { merged }
}
