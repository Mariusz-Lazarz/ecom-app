import type { Cart, CartItem } from "@/lib/cart"
import { shippingRules } from "@/lib/shipping"
import { MAX_LINE_QUANTITY } from "@/lib/validation/cart"

/**
 * Client-safe cart helpers: the optimistic updates the cart UI applies while a cart action runs,
 * whether the cart can go to checkout, and the free-shipping figures. The totals follow the same
 * rules as `getCart()` in `@/lib/cart`.
 */

export type CartChange =
  | { type: "quantity"; productId: string; quantity: number }
  | { type: "remove"; productId: string }
  | { type: "clear" }

/** The most of one product a line can hold right now: min(stock, 99), or 0 when out of stock. */
export function lineLimit(stock: number) {
  return Math.max(0, Math.min(stock, MAX_LINE_QUANTITY))
}

function withQuantity(item: CartItem, quantity: number): CartItem {
  return {
    ...item,
    quantity,
    lineTotalCents: item.priceCents * quantity,
    limited: item.available && quantity > item.stock,
  }
}

/** Recomputes the counts and totals: every line counts towards `itemCount`, only available ones towards the money. */
export function summarize(items: CartItem[], currency: string): Cart {
  let itemCount = 0
  let subtotalCents = 0
  let savingsCents = 0
  for (const item of items) {
    itemCount += item.quantity
    if (!item.available) continue
    subtotalCents += item.lineTotalCents
    if (item.onSale && item.compareAtCents !== null) savingsCents += (item.compareAtCents - item.priceCents) * item.quantity
  }
  return { items, itemCount, subtotalCents, savingsCents, currency: items[0]?.currency ?? currency }
}

/** The cart as it will look once `change` is saved. A quantity of 0 removes the line, like `updateCartItem`. */
export function applyCartChange(cart: Cart, change: CartChange): Cart {
  switch (change.type) {
    case "clear":
      return summarize([], cart.currency)
    case "remove":
      return summarize(
        cart.items.filter((item) => item.productId !== change.productId),
        cart.currency,
      )
    case "quantity":
      if (change.quantity <= 0) return applyCartChange(cart, { type: "remove", productId: change.productId })
      return summarize(
        cart.items.map((item) => (item.productId === change.productId ? withQuantity(item, change.quantity) : item)),
        cart.currency,
      )
  }
}

/**
 * Why the cart can't go to checkout yet, or null when it can. Checkout would reject out-of-stock
 * lines and lines asking for more than is in stock, so those have to be fixed in the cart first.
 */
export function checkoutBlocker(cart: Pick<Cart, "items">): string | null {
  if (cart.items.length === 0) return "Your cart is empty."
  if (cart.items.some((item) => !item.available)) return "Remove the out-of-stock items to check out."
  if (cart.items.some((item) => item.limited)) return "Reduce the quantities to what's in stock to check out."
  return null
}

export const FREE_SHIPPING_THRESHOLD_CENTS = Math.round(shippingRules.freeThreshold * 100)

/** How far a subtotal is from free standard shipping, which applies at or above the threshold. */
export function freeShippingProgress(subtotalCents: number) {
  const remainingCents = Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - subtotalCents)
  return {
    unlocked: remainingCents === 0,
    remainingCents,
    // Rounded down, so the bar is only full once shipping is actually free.
    percent: Math.min(100, Math.floor((subtotalCents / FREE_SHIPPING_THRESHOLD_CENTS) * 100)),
  }
}
