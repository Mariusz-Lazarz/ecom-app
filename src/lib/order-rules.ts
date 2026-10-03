import { FREE_SHIPPING_THRESHOLD_CENTS } from "@/lib/cart-state"
import { BadRequestError } from "@/lib/errors"
import { paymentMethods, type PaymentMethod } from "@/lib/payments"
import { shippingMethods, type ShippingMethod } from "@/lib/shipping"

/**
 * Client-safe order rules shared by `@/lib/orders`, the checkout and admin UIs and the seed: the
 * checkout quote and the order status machine.
 */

// ── Statuses ─────────────────────────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled", "rejected"] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/**
 * The only allowed status changes. A placed order is paid and starts as `pending`; `cancelled` and
 * `rejected` are reachable only before shipping. `delivered`, `cancelled` and `rejected` are final.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: ["processing", "cancelled", "rejected"],
  processing: ["shipped", "cancelled", "rejected"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  rejected: [],
}

/** Statuses a customer may cancel their own order from. */
export const CUSTOMER_CANCELLABLE_STATUSES: readonly OrderStatus[] = ["pending"]

/** Moving into these puts the order's items back in stock. */
export const RESTOCKING_STATUSES: readonly OrderStatus[] = ["cancelled", "rejected"]

/** Orders in these statuses don't count towards revenue. */
export const NON_REVENUE_STATUSES: readonly OrderStatus[] = ["cancelled", "rejected"]

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value)
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to)
}

export function canCustomerCancel(status: OrderStatus): boolean {
  return CUSTOMER_CANCELLABLE_STATUSES.includes(status)
}

// ── Checkout quote ───────────────────────────────────────────────────────────────────────────────

/** A cart line as the quote sees it; `CartItem` from `@/lib/cart` fits. */
export type QuoteLine = {
  priceCents: number
  compareAtCents: number | null
  quantity: number
  // Lines marked unavailable (out of stock) are left out, like in the cart totals.
  available?: boolean
}

export type CheckoutQuote = {
  subtotalCents: number
  // What on-sale lines save against their compare-at price.
  savingsCents: number
  // What the customer pays for shipping: 0 when the method is free-eligible and the subtotal
  // reaches the free-shipping threshold, otherwise the method's price.
  shippingCents: number
  totalCents: number
  freeShipping: boolean
  shippingMethod: ShippingMethod
  // The method's list price, whether or not it was waived.
  shippingMethodPriceCents: number
}

export const toCents = (amount: number) => Math.round(amount * 100)

export function findShippingMethod(id: string): ShippingMethod | undefined {
  return shippingMethods.find((method) => method.id === id)
}

export function findPaymentMethod(id: string): PaymentMethod | undefined {
  return paymentMethods.find((method) => method.id === id)
}

/**
 * The money for an order: the checkout UI shows it for the cart, and `placeOrder` computes the
 * real figures with it from the locked, live product prices.
 *
 * @throws BadRequestError for an unknown shipping method.
 */
export function quoteCheckout(cart: { items: readonly QuoteLine[] }, shippingMethodId: string): CheckoutQuote {
  const shippingMethod = findShippingMethod(shippingMethodId)
  if (!shippingMethod) throw new BadRequestError("Unknown shipping method.")

  let subtotalCents = 0
  let savingsCents = 0
  for (const line of cart.items) {
    if (line.available === false) continue
    subtotalCents += line.priceCents * line.quantity
    if (line.compareAtCents !== null && line.compareAtCents > line.priceCents) {
      savingsCents += (line.compareAtCents - line.priceCents) * line.quantity
    }
  }

  const shippingMethodPriceCents = toCents(shippingMethod.price)
  const freeShipping =
    shippingMethodPriceCents > 0 && shippingMethod.freeEligible && subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
  const shippingCents = freeShipping ? 0 : shippingMethodPriceCents

  return {
    subtotalCents,
    savingsCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    freeShipping,
    shippingMethod,
    shippingMethodPriceCents,
  }
}
