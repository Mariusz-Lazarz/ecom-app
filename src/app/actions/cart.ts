"use server"

import { refresh } from "next/cache"
import * as z from "zod"

import * as cart from "@/lib/cart"
import { AppError, GENERIC_MESSAGE, logError } from "@/lib/errors"
import {
  AddToCartSchema,
  RemoveCartItemSchema,
  UpdateCartItemSchema,
  type AddToCartInput,
  type RemoveCartItemInput,
  type UpdateCartItemInput,
  MAX_LINE_QUANTITY,
} from "@/lib/validation/cart"
import { DiscountCodeEntrySchema } from "@/lib/validation/discounts"

/**
 * What every cart action resolves to. Actions never throw to the client: a validation problem
 * comes back as `errors`, an expected failure (unknown product, out of stock…) as `message`, and
 * anything else as a generic `message` after being logged.
 */
export type CartActionResult = {
  ok: boolean
  // For a toast: why it failed, or a note on success (e.g. the quantity was capped by stock).
  message?: string
  errors?: Partial<Record<"productId" | "quantity", string[]>>
  // The cart's item count after a successful change, for the header badge.
  itemCount?: number
  // The line that changed (absent for clearCart).
  line?: cart.CartLineChange
}

type CartActionState = CartActionResult | undefined

// Each action takes either one argument (a plain object or FormData, for direct calls and
// `<form action>`), or `(previousState, formData)` as `useActionState` calls it.
function readInput(first: unknown, formData: FormData | undefined): Record<string, unknown> {
  const data = formData ?? (first instanceof FormData ? first : undefined)
  if (!data) return (first ?? {}) as Record<string, unknown>
  const field = (name: string) => {
    const value = data.get(name)
    return typeof value === "string" ? value : undefined
  }
  return { productId: field("productId"), quantity: field("quantity") }
}

async function run<S extends z.ZodType>(
  schema: S,
  input: Record<string, unknown>,
  scope: string,
  mutate: (data: z.output<S>) => Promise<CartActionResult>,
): Promise<CartActionResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: "Please check the item and quantity.", errors: z.flattenError(parsed.error).fieldErrors }
  }
  try {
    const result = await mutate(parsed.data)
    // Re-render the server components on screen (header badge, /cart) with the new cart.
    refresh()
    return result
  } catch (err) {
    logError(err, scope)
    if (err instanceof AppError && err.status < 500) return { ok: false, message: err.message }
    return { ok: false, message: GENERIC_MESSAGE }
  }
}

// A capped write leaves the line at its limit, min(stock, 99), so `line.quantity` is that limit.
function limitNote(line: cart.CartLineChange) {
  return line.stock < MAX_LINE_QUANTITY ? `Only ${line.stock} available` : `You can have up to ${MAX_LINE_QUANTITY}`
}

function addedMessage(line: cart.CartLineChange) {
  if (!line.clamped) return undefined
  if (line.added === 0) return `${limitNote(line)} and they're all in your cart already.`
  return `${limitNote(line)}, so ${line.added} added to your cart.`
}

export async function addToCart(input: AddToCartInput | FormData): Promise<CartActionResult>
export async function addToCart(state: CartActionState, formData: FormData): Promise<CartActionResult>
export async function addToCart(first: AddToCartInput | FormData | CartActionState, formData?: FormData) {
  return run(AddToCartSchema, readInput(first, formData), "cart.add", async ({ productId, quantity }) => {
    const line = await cart.addToCart(productId, quantity)
    return { ok: true, message: addedMessage(line), itemCount: line.itemCount, line }
  })
}

/** Sets a line's quantity; 0 removes it. */
export async function updateCartItem(input: UpdateCartItemInput | FormData): Promise<CartActionResult>
export async function updateCartItem(state: CartActionState, formData: FormData): Promise<CartActionResult>
export async function updateCartItem(first: UpdateCartItemInput | FormData | CartActionState, formData?: FormData) {
  return run(UpdateCartItemSchema, readInput(first, formData), "cart.update", async ({ productId, quantity }) => {
    const line = await cart.setQuantity(productId, quantity)
    const message = line.clamped ? `${limitNote(line)}.` : undefined
    return { ok: true, message, itemCount: line.itemCount, line }
  })
}

export async function removeCartItem(input: RemoveCartItemInput | FormData): Promise<CartActionResult>
export async function removeCartItem(state: CartActionState, formData: FormData): Promise<CartActionResult>
export async function removeCartItem(first: RemoveCartItemInput | FormData | CartActionState, formData?: FormData) {
  return run(RemoveCartItemSchema, readInput(first, formData), "cart.remove", async ({ productId }) => {
    const line = await cart.removeFromCart(productId)
    return { ok: true, itemCount: line.itemCount, line }
  })
}

// Takes no input; extra arguments (e.g. from useActionState or a form) are ignored.
export async function clearCart(): Promise<CartActionResult> {
  return run(z.object({}), {}, "cart.clear", async () => {
    await cart.clearCart()
    return { ok: true, itemCount: 0 }
  })
}

/** What `applyDiscountCode` and `removeDiscountCode` resolve to. */
export type DiscountActionResult = {
  ok: boolean
  // Why the code couldn't be applied (shown under the code field).
  message?: string
  // The code as applied (upper-cased).
  code?: string
}

/**
 * Applies a discount code to the signed-in user's cart (checkout's code field). Fails with a
 * `message` for guests, an empty cart, or a code `checkDiscountCode` rejects; on success the page
 * re-renders with the code in the cart.
 */
export async function applyDiscountCode(code: string): Promise<DiscountActionResult> {
  const parsed = DiscountCodeEntrySchema.safeParse(code)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }
  try {
    const rule = await cart.applyDiscountCode(parsed.data)
    refresh()
    return { ok: true, code: rule.code }
  } catch (err) {
    logError(err, "cart.discount.apply")
    return { ok: false, message: err instanceof AppError && err.status < 500 ? err.message : GENERIC_MESSAGE }
  }
}

/** Removes the discount code from the signed-in user's cart. */
export async function removeDiscountCode(): Promise<DiscountActionResult> {
  try {
    await cart.removeDiscountCode()
    refresh()
    return { ok: true }
  } catch (err) {
    logError(err, "cart.discount.remove")
    return { ok: false, message: GENERIC_MESSAGE }
  }
}
