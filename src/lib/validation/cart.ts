import * as z from "zod"

// One cart line never holds more than this (also enforced by a CHECK on cart_items.quantity).
export const MAX_LINE_QUANTITY = 99

// Form fields arrive as strings (or null when missing); direct calls pass numbers.
const quantity = (min: number) =>
  z.coerce
    .number({ error: "Quantity must be a number." })
    .int({ error: "Quantity must be a whole number." })
    .min(min, { error: `Quantity must be at least ${min}.` })
    .max(MAX_LINE_QUANTITY, { error: `Quantity can't be more than ${MAX_LINE_QUANTITY}.` })

const productId = z.uuid({ error: "Unknown product." })

export const AddToCartSchema = z.object({
  productId,
  quantity: quantity(1).default(1),
})

// 0 removes the line.
export const UpdateCartItemSchema = z.object({
  productId,
  quantity: quantity(0),
})

export const RemoveCartItemSchema = z.object({ productId })

export type AddToCartInput = z.input<typeof AddToCartSchema>
export type UpdateCartItemInput = z.input<typeof UpdateCartItemSchema>
export type RemoveCartItemInput = z.input<typeof RemoveCartItemSchema>
