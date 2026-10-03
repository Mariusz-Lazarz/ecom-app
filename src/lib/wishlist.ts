import "server-only"

import { auth } from "@/auth"
import { query } from "@/lib/db"
import { NotFoundError } from "@/lib/errors"
import type { ProductImage } from "@/lib/products"
import { mediaUrl } from "@/lib/storage"

/**
 * The wishlist: products a signed-in customer saved for later (`wishlist_items`). Guests have none.
 *
 * Rows hold only the pair; price, sale state and stock are read live from products. The functions
 * that take a `userId` work for any user (the Server Actions pass the session's); `getWishlistedIds`
 * and `getWishlistCount` read the session themselves, for Server Components.
 */

export type WishlistItem = {
  productId: string
  slug: string
  name: string
  brand: string
  // The primary image (position 0), or null when the product has none.
  image: ProductImage | null
  priceCents: number
  // The "was" price, or null. `onSale` is true when it's above `priceCents`.
  compareAtCents: number | null
  onSale: boolean
  currency: string
  stock: number
  inStock: boolean
  addedAt: Date
}

/**
 * The current visitor's saved products among some listed ones: a Set of product ids for a signed-in
 * user (empty when none are saved), or null for a guest.
 */
export type WishlistIds = Set<string> | null

type ItemRow = {
  product_id: string
  slug: string
  name: string
  brand: string
  price_cents: number
  compare_at_cents: number | null
  currency: string
  stock: number
  added_at: Date
  image_key: string | null
  image_width: number | null
  image_height: number | null
  image_alt: string | null
}

function toItem(row: ItemRow): WishlistItem {
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
    stock: row.stock,
    inStock: row.stock > 0,
    addedAt: row.added_at,
  }
}

/** The user's saved products with live prices and stock, most recently saved first. */
export async function listWishlist(userId: string): Promise<WishlistItem[]> {
  const { rows } = await query<ItemRow>(
    `SELECT w.product_id, w.added_at, p.slug, p.name, p.brand, p.price_cents, p.compare_at_cents, p.currency,
            p.stock, img.storage_key AS image_key, img.width AS image_width, img.height AS image_height,
            img.alt AS image_alt
     FROM wishlist_items w
     JOIN products p ON p.id = w.product_id
     LEFT JOIN LATERAL (
       SELECT storage_key, width, height, alt FROM product_images
       WHERE product_id = p.id ORDER BY position LIMIT 1
     ) img ON true
     WHERE w.user_id = $1
     ORDER BY w.added_at DESC, w.product_id`,
    [userId],
  )
  return rows.map(toItem)
}

/** How many products the user has saved. */
export async function countWishlist(userId: string): Promise<number> {
  const { rows } = await query<{ count: number }>(
    "SELECT count(*)::int AS count FROM wishlist_items WHERE user_id = $1",
    [userId],
  )
  return rows[0].count
}

/**
 * Saves a product. Saving one that is already saved changes nothing (it keeps its place).
 * Returns whether it was newly added.
 *
 * @throws NotFoundError when the product doesn't exist.
 */
export async function addToWishlist(userId: string, productId: string): Promise<{ added: boolean }> {
  const { rowCount } = await query(
    `INSERT INTO wishlist_items (user_id, product_id)
     SELECT $1, id FROM products WHERE id = $2
     ON CONFLICT (user_id, product_id) DO NOTHING`,
    [userId, productId],
  )
  if (rowCount) return { added: true }
  const { rowCount: exists } = await query("SELECT 1 FROM products WHERE id = $1", [productId])
  if (!exists) throw new NotFoundError("This product no longer exists.")
  return { added: false }
}

/** Removes a saved product. Removing one that isn't saved is a no-op. Returns whether a row went. */
export async function removeFromWishlist(userId: string, productId: string): Promise<{ removed: boolean }> {
  const { rowCount } = await query("DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2", [
    userId,
    productId,
  ])
  return { removed: Boolean(rowCount) }
}

/**
 * Saves the product when it isn't saved, removes it when it is. Returns whether it is saved now.
 *
 * @throws NotFoundError when saving a product that doesn't exist.
 */
export async function toggleWishlist(userId: string, productId: string): Promise<{ saved: boolean }> {
  const { removed } = await removeFromWishlist(userId, productId)
  if (removed) return { saved: false }
  await addToWishlist(userId, productId)
  return { saved: true }
}

/** Which of `productIds` the user has saved, in one query. */
export async function listWishlistedIds(userId: string, productIds: readonly string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set()
  const { rows } = await query<{ product_id: string }>(
    "SELECT product_id FROM wishlist_items WHERE user_id = $1 AND product_id = ANY($2::uuid[])",
    [userId, productIds],
  )
  return new Set(rows.map((row) => row.product_id))
}

/**
 * The current visitor's saved products among `productIds`, for marking the hearts on a list of
 * product cards with one query: null for a guest (no query), otherwise a Set of ids.
 */
export async function getWishlistedIds(productIds: readonly string[]): Promise<WishlistIds> {
  const userId = (await auth())?.user?.id
  if (!userId) return null
  return listWishlistedIds(userId, productIds)
}

/** The current visitor's saved-product count for the header badge: 0 for a guest (no query). */
export async function getWishlistCount(): Promise<number> {
  const userId = (await auth())?.user?.id
  return userId ? countWishlist(userId) : 0
}
