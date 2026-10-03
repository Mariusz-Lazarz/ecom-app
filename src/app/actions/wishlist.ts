"use server"

import { refresh } from "next/cache"
import * as z from "zod"

import { addToCart } from "@/app/actions/cart"
import { auth } from "@/auth"
import * as cart from "@/lib/cart"
import { AppError, GENERIC_MESSAGE, logError } from "@/lib/errors"
import { WishlistItemSchema, type WishlistItemInput } from "@/lib/validation/wishlist"
import * as wishlist from "@/lib/wishlist"

/**
 * Wishlist Server Actions, for signed-in customers only. They never throw to the client: a guest
 * gets `signedOut` (the UI sends them to /login), invalid input and expected failures (unknown
 * product, out of stock…) come back as `message`, anything else as a generic `message` after being
 * logged. Successful writes `refresh()` the page, so the header badge and the hearts follow.
 */

export type WishlistActionResult = {
  ok: boolean
  // For a toast: why it failed, or a note on success (e.g. a cart quantity capped by stock).
  message?: string
  // true when the caller isn't signed in.
  signedOut?: boolean
  // Whether the product is saved after the change (toggle, remove, move).
  saved?: boolean
  // The cart's item count after a move to the cart.
  cartCount?: number
}

export type AddAllToCartResult = WishlistActionResult & {
  // How many saved products went into the cart, and how many were skipped (out of stock).
  added?: number
  skipped?: number
}

const SIGN_IN_MESSAGE = "Sign in to save items."

async function run<T extends WishlistActionResult>(
  scope: string,
  mutate: (userId: string) => Promise<T>,
): Promise<T | WishlistActionResult> {
  try {
    const userId = (await auth())?.user?.id
    if (!userId) return { ok: false, signedOut: true, message: SIGN_IN_MESSAGE }
    const result = await mutate(userId)
    if (result.ok) refresh()
    return result
  } catch (err) {
    logError(err, scope)
    if (err instanceof AppError && err.status < 500) return { ok: false, message: err.message }
    return { ok: false, message: GENERIC_MESSAGE }
  }
}

function parse(input: unknown) {
  const parsed = WishlistItemSchema.safeParse(input ?? {})
  if (parsed.success) return parsed.data
  return { error: z.flattenError(parsed.error).fieldErrors.productId?.[0] ?? "Unknown product." }
}

/** Saves the product when it isn't saved, removes it when it is. */
export async function toggleWishlistItem(input: WishlistItemInput): Promise<WishlistActionResult> {
  const data = parse(input)
  if ("error" in data) return { ok: false, message: data.error }
  return run("wishlist.toggle", async (userId) => {
    const { saved } = await wishlist.toggleWishlist(userId, data.productId)
    return { ok: true, saved }
  })
}

export async function removeWishlistItem(input: WishlistItemInput): Promise<WishlistActionResult> {
  const data = parse(input)
  if ("error" in data) return { ok: false, message: data.error }
  return run("wishlist.remove", async (userId) => {
    await wishlist.removeFromWishlist(userId, data.productId)
    return { ok: true, saved: false }
  })
}

/**
 * Adds one unit to the cart and, when that worked, removes the product from the wishlist. A failed
 * add (out of stock, deleted product) leaves it saved and returns the cart's message.
 */
export async function moveWishlistItemToCart(input: WishlistItemInput): Promise<WishlistActionResult> {
  const data = parse(input)
  if ("error" in data) return { ok: false, message: data.error }
  return run("wishlist.move", async (userId) => {
    const added = await addToCart({ productId: data.productId, quantity: 1 })
    if (!added.ok) return { ok: false, saved: true, message: added.message }
    await wishlist.removeFromWishlist(userId, data.productId)
    return { ok: true, saved: false, message: added.message, cartCount: added.itemCount }
  })
}

/**
 * Adds one unit of every in-stock saved product to the cart. The products stay saved. Ones that
 * are out of stock, or sell out meanwhile, are skipped and counted.
 */
export async function addAllWishlistToCart(): Promise<AddAllToCartResult> {
  return run<AddAllToCartResult>("wishlist.addAll", async (userId) => {
    const items = await wishlist.listWishlist(userId)
    let added = 0
    let skipped = 0
    let cartCount: number | undefined
    for (const item of items) {
      if (!item.inStock) {
        skipped += 1
        continue
      }
      try {
        cartCount = (await cart.addToCart(item.productId, 1)).itemCount
        added += 1
      } catch (err) {
        if (!(err instanceof AppError && err.status < 500)) throw err
        skipped += 1
      }
    }
    if (added === 0) {
      return { ok: false, added, skipped, message: "None of your saved items are in stock right now." }
    }
    return { ok: true, added, skipped, cartCount }
  })
}
