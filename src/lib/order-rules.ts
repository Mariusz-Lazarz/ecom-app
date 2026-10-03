import { FREE_SHIPPING_THRESHOLD_CENTS } from "@/lib/cart-state"
import { formatPrice } from "@/lib/catalogue"
import { BadRequestError } from "@/lib/errors"
import { paymentMethods, type PaymentMethod } from "@/lib/payments"
import { shippingMethods, type ShippingMethod } from "@/lib/shipping"

/**
 * Client-safe order rules shared by `@/lib/orders`, `@/lib/discounts`, the cart, checkout and admin
 * UIs and the seed: the order status machine, discount code checks and the checkout quote.
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

// ── Discount codes ───────────────────────────────────────────────────────────────────────────────

export const DISCOUNT_TYPES = ["percent", "fixed", "free_shipping"] as const
export type DiscountType = (typeof DISCOUNT_TYPES)[number]

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  percent: "Percent off",
  fixed: "Amount off",
  free_shipping: "Free shipping",
}

/** What a code does to the money, once it has passed `checkDiscountCode`. */
export type DiscountRule = {
  code: string
  type: DiscountType
  // percent: 1–100; fixed: cents off the subtotal; free_shipping: 0.
  value: number
  // The subtotal (after sale prices, before the code) must be at least this.
  minSubtotalCents: number
}

/** A code with everything `checkDiscountCode` needs to judge it for one customer. */
export type DiscountCodeState = DiscountRule & {
  active: boolean
  startsAt: Date | null
  endsAt: Date | null
  maxRedemptions: number | null
  perUserLimit: number | null
  // Redemptions over all customers / by this customer (cancelled and rejected orders don't count).
  redemptionCount: number
  userRedemptionCount: number
}

/** Why a code can't be used right now. */
export type DiscountProblem =
  | { reason: "unknown" }
  | { reason: "inactive" }
  | { reason: "not_started"; startsAt: Date }
  | { reason: "expired" }
  | { reason: "max_redemptions" }
  | { reason: "already_used" }
  | { reason: "below_minimum"; minSubtotalCents: number; shortByCents: number }

export type DiscountCheck = { ok: true; rule: DiscountRule } | { ok: false; problem: DiscountProblem }

/** Codes are stored and compared upper-case, without surrounding spaces. */
export const normalizeDiscountCode = (code: string) => code.trim().toUpperCase()

/**
 * Whether `code` (null when no such code exists) can be applied to a subtotal right now. Problems
 * the customer can't fix come first; "below minimum" comes last, since adding to the cart fixes it.
 */
export function checkDiscountCode(code: DiscountCodeState | null, subtotalCents: number, now = new Date()): DiscountCheck {
  if (!code) return { ok: false, problem: { reason: "unknown" } }
  if (!code.active) return { ok: false, problem: { reason: "inactive" } }
  if (code.startsAt && now < code.startsAt) return { ok: false, problem: { reason: "not_started", startsAt: code.startsAt } }
  if (code.endsAt && now >= code.endsAt) return { ok: false, problem: { reason: "expired" } }
  if (code.maxRedemptions !== null && code.redemptionCount >= code.maxRedemptions) {
    return { ok: false, problem: { reason: "max_redemptions" } }
  }
  if (code.perUserLimit !== null && code.userRedemptionCount >= code.perUserLimit) {
    return { ok: false, problem: { reason: "already_used" } }
  }
  if (subtotalCents < code.minSubtotalCents) {
    return {
      ok: false,
      problem: {
        reason: "below_minimum",
        minSubtotalCents: code.minSubtotalCents,
        shortByCents: code.minSubtotalCents - subtotalCents,
      },
    }
  }
  return {
    ok: true,
    rule: { code: code.code, type: code.type, value: code.value, minSubtotalCents: code.minSubtotalCents },
  }
}

/** The customer-facing explanation of a problem with `code`. */
export function discountProblemMessage(code: string, problem: DiscountProblem, currency = "USD"): string {
  switch (problem.reason) {
    case "unknown":
      return `${code} isn't a valid discount code.`
    case "inactive":
      return `${code} is no longer available.`
    case "not_started":
      return `${code} can't be used yet. It starts on ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(problem.startsAt)}.`
    case "expired":
      return `${code} has expired.`
    case "max_redemptions":
      return `${code} has reached its usage limit.`
    case "already_used":
      return `You've already used ${code}.`
    case "below_minimum":
      return `${code} needs a subtotal of at least ${formatPrice(problem.minSubtotalCents, currency)}. Add ${formatPrice(problem.shortByCents, currency)} more to use it.`
  }
}

/** A rule as shown to people: "10% off", "$15.00 off", "Free shipping". */
export function describeDiscount(rule: Pick<DiscountRule, "type" | "value">, currency = "USD"): string {
  switch (rule.type) {
    case "percent":
      return `${rule.value}% off`
    case "fixed":
      return `${formatPrice(rule.value, currency)} off`
    case "free_shipping":
      return "Free shipping"
  }
}

/**
 * What `rule` takes off a subtotal, in cents: percent rounds half up to the cent, fixed is capped
 * at the subtotal, and free shipping takes nothing off the subtotal (it zeroes shipping instead).
 * 0 when the subtotal is below the rule's minimum.
 */
export function discountOnSubtotal(rule: Pick<DiscountRule, "type" | "value" | "minSubtotalCents">, subtotalCents: number) {
  if (subtotalCents < rule.minSubtotalCents || subtotalCents <= 0) return 0
  switch (rule.type) {
    case "percent":
      // Integer maths: (subtotal × percent) / 100, rounded half up.
      return Math.min(subtotalCents, Math.floor((subtotalCents * rule.value + 50) / 100))
    case "fixed":
      return Math.min(subtotalCents, rule.value)
    case "free_shipping":
      return 0
  }
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
  // The applied code, or null without one (or when the subtotal is below its minimum).
  discount: DiscountRule | null
  // What the code takes off the subtotal (0 for free shipping, which zeroes shipping instead).
  discountCents: number
  // Shipping the code waived on top of any free-shipping threshold (free-shipping codes only).
  shippingDiscountCents: number
  // What the customer pays for shipping: 0 when a free-shipping code applies, or when the method
  // is free-eligible and the subtotal reaches the free-shipping threshold; otherwise the method's price.
  shippingCents: number
  // subtotal − discount + shipping; never below 0, since the discount is capped at the subtotal.
  totalCents: number
  // The method's price was waived by the free-shipping threshold (not by a code).
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
 * The money for an order: the cart and checkout UIs show it for the cart, and `placeOrder` computes
 * the real figures with it from the locked, live product prices. `discount` is a code that already
 * passed `checkDiscountCode`; it's left out (`discount: null`) when the subtotal is below its
 * minimum. The free-shipping threshold looks at the subtotal before the code.
 *
 * @throws BadRequestError for an unknown shipping method.
 */
export function quoteCheckout(
  cart: { items: readonly QuoteLine[] },
  shippingMethodId: string,
  discount: DiscountRule | null = null,
): CheckoutQuote {
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
  const regularShippingCents = freeShipping ? 0 : shippingMethodPriceCents

  const applied = discount && subtotalCents >= discount.minSubtotalCents ? discount : null
  const discountCents = applied ? discountOnSubtotal(applied, subtotalCents) : 0
  const shippingDiscountCents = applied?.type === "free_shipping" ? regularShippingCents : 0
  const shippingCents = regularShippingCents - shippingDiscountCents

  return {
    subtotalCents,
    savingsCents,
    discount: applied,
    discountCents,
    shippingDiscountCents,
    shippingCents,
    totalCents: Math.max(0, subtotalCents - discountCents + shippingCents),
    freeShipping,
    shippingMethod,
    shippingMethodPriceCents,
  }
}
