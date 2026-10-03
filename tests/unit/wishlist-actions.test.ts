import { beforeEach, describe, expect, it, vi } from "vitest"

import { ConflictError, NotFoundError } from "@/lib/errors"

const wishlist = vi.hoisted(() => ({
  toggleWishlist: vi.fn(),
  removeFromWishlist: vi.fn(),
  listWishlist: vi.fn(),
}))
const cart = vi.hoisted(() => ({ addToCart: vi.fn() }))
const cartActions = vi.hoisted(() => ({ addToCart: vi.fn() }))
const auth = vi.fn()
const refresh = vi.fn()

vi.mock("@/lib/wishlist", () => wishlist)
vi.mock("@/lib/cart", () => cart)
vi.mock("@/app/actions/cart", () => cartActions)
vi.mock("@/auth", () => ({ auth: () => auth() }))
vi.mock("next/cache", () => ({ refresh: () => refresh() }))

const { toggleWishlistItem, removeWishlistItem, moveWishlistItemToCart, addAllWishlistToCart } = await import(
  "@/app/actions/wishlist"
)

const USER_ID = "0b3c1f7e-9a2d-4e5f-8a6b-7c8d9e0f1a2b"
const PRODUCT_ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e"
const SIGNED_OUT = { ok: false, signedOut: true, message: "Sign in to save items." }

const item = (productId: string, stock: number) => ({ productId, name: productId, stock, inStock: stock > 0 })

beforeEach(() => {
  for (const fn of [...Object.values(wishlist), cart.addToCart, cartActions.addToCart, refresh]) fn.mockReset()
  auth.mockReset().mockResolvedValue({ user: { id: USER_ID } })
})

describe("toggleWishlistItem", () => {
  it("toggles for the signed-in user and refreshes the page", async () => {
    wishlist.toggleWishlist.mockResolvedValue({ saved: true })

    expect(await toggleWishlistItem({ productId: PRODUCT_ID })).toEqual({ ok: true, saved: true })
    expect(wishlist.toggleWishlist).toHaveBeenCalledExactlyOnceWith(USER_ID, PRODUCT_ID)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("reports an unsave", async () => {
    wishlist.toggleWishlist.mockResolvedValue({ saved: false })

    expect(await toggleWishlistItem({ productId: PRODUCT_ID })).toEqual({ ok: true, saved: false })
  })

  it.each([[null], [{ user: {} }], [{ user: { id: "" } }]])("tells a guest to sign in (session %j)", async (session) => {
    auth.mockResolvedValue(session)

    expect(await toggleWishlistItem({ productId: PRODUCT_ID })).toEqual(SIGNED_OUT)
    expect(wishlist.toggleWishlist).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it.each([["not-a-uuid"], [""], [undefined]])("rejects the product id %j without touching the DB", async (productId) => {
    expect(await toggleWishlistItem({ productId } as { productId: string })).toEqual({
      ok: false,
      message: "Unknown product.",
    })
    expect(wishlist.toggleWishlist).not.toHaveBeenCalled()
    expect(auth).not.toHaveBeenCalled()
  })

  it("returns an expected error's message", async () => {
    wishlist.toggleWishlist.mockRejectedValue(new NotFoundError("This product no longer exists."))

    expect(await toggleWishlistItem({ productId: PRODUCT_ID })).toEqual({
      ok: false,
      message: "This product no longer exists.",
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("hides an unexpected error behind the generic message", async () => {
    wishlist.toggleWishlist.mockRejectedValue(new Error("connection refused"))

    expect(await toggleWishlistItem({ productId: PRODUCT_ID })).toEqual({
      ok: false,
      message: "Something went wrong. Please try again.",
    })
  })
})

describe("removeWishlistItem", () => {
  it("removes for the signed-in user", async () => {
    wishlist.removeFromWishlist.mockResolvedValue({ removed: true })

    expect(await removeWishlistItem({ productId: PRODUCT_ID })).toEqual({ ok: true, saved: false })
    expect(wishlist.removeFromWishlist).toHaveBeenCalledExactlyOnceWith(USER_ID, PRODUCT_ID)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("tells a guest to sign in", async () => {
    auth.mockResolvedValue(null)

    expect(await removeWishlistItem({ productId: PRODUCT_ID })).toEqual(SIGNED_OUT)
    expect(wishlist.removeFromWishlist).not.toHaveBeenCalled()
  })
})

describe("moveWishlistItemToCart", () => {
  it("adds one to the cart, then removes it from the wishlist", async () => {
    cartActions.addToCart.mockResolvedValue({ ok: true, itemCount: 4 })

    expect(await moveWishlistItemToCart({ productId: PRODUCT_ID })).toEqual({
      ok: true,
      saved: false,
      message: undefined,
      cartCount: 4,
    })
    expect(cartActions.addToCart).toHaveBeenCalledExactlyOnceWith({ productId: PRODUCT_ID, quantity: 1 })
    expect(wishlist.removeFromWishlist).toHaveBeenCalledExactlyOnceWith(USER_ID, PRODUCT_ID)
    expect(refresh).toHaveBeenCalled()
  })

  it("passes on the cart's note when the add was capped", async () => {
    const note = "Only 2 available and they're all in your cart already."
    cartActions.addToCart.mockResolvedValue({ ok: true, itemCount: 2, message: note })

    expect(await moveWishlistItemToCart({ productId: PRODUCT_ID })).toMatchObject({ ok: true, message: note })
    expect(wishlist.removeFromWishlist).toHaveBeenCalledOnce()
  })

  it("keeps the product saved and returns the cart's message when it's out of stock", async () => {
    cartActions.addToCart.mockResolvedValue({ ok: false, message: "This product is out of stock." })

    expect(await moveWishlistItemToCart({ productId: PRODUCT_ID })).toEqual({
      ok: false,
      saved: true,
      message: "This product is out of stock.",
    })
    expect(wishlist.removeFromWishlist).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("tells a guest to sign in without touching the cart", async () => {
    auth.mockResolvedValue(null)

    expect(await moveWishlistItemToCart({ productId: PRODUCT_ID })).toEqual(SIGNED_OUT)
    expect(cartActions.addToCart).not.toHaveBeenCalled()
  })

  it("rejects an invalid product id", async () => {
    expect(await moveWishlistItemToCart({ productId: "nope" })).toEqual({ ok: false, message: "Unknown product." })
    expect(cartActions.addToCart).not.toHaveBeenCalled()
  })
})

describe("addAllWishlistToCart", () => {
  it("adds one of each in-stock item, skips the rest and keeps them all saved", async () => {
    wishlist.listWishlist.mockResolvedValue([item("a", 5), item("b", 0), item("c", 1)])
    cart.addToCart.mockResolvedValueOnce({ itemCount: 1 }).mockResolvedValueOnce({ itemCount: 2 })

    expect(await addAllWishlistToCart()).toEqual({ ok: true, added: 2, skipped: 1, cartCount: 2 })
    expect(wishlist.listWishlist).toHaveBeenCalledExactlyOnceWith(USER_ID)
    expect(cart.addToCart.mock.calls).toEqual([
      ["a", 1],
      ["c", 1],
    ])
    expect(wishlist.removeFromWishlist).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("skips an item that sold out after the list was read", async () => {
    wishlist.listWishlist.mockResolvedValue([item("a", 5), item("b", 3)])
    cart.addToCart
      .mockRejectedValueOnce(new ConflictError("This product is out of stock."))
      .mockResolvedValueOnce({ itemCount: 7 })

    expect(await addAllWishlistToCart()).toEqual({ ok: true, added: 1, skipped: 1, cartCount: 7 })
  })

  it("fails with a message when nothing is in stock", async () => {
    wishlist.listWishlist.mockResolvedValue([item("a", 0)])

    expect(await addAllWishlistToCart()).toEqual({
      ok: false,
      added: 0,
      skipped: 1,
      message: "None of your saved items are in stock right now.",
    })
    expect(cart.addToCart).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("stops with the generic message on an unexpected cart error", async () => {
    wishlist.listWishlist.mockResolvedValue([item("a", 5)])
    cart.addToCart.mockRejectedValue(new Error("connection refused"))

    expect(await addAllWishlistToCart()).toEqual({ ok: false, message: "Something went wrong. Please try again." })
  })

  it("tells a guest to sign in", async () => {
    auth.mockResolvedValue(null)

    expect(await addAllWishlistToCart()).toEqual(SIGNED_OUT)
    expect(wishlist.listWishlist).not.toHaveBeenCalled()
  })
})
