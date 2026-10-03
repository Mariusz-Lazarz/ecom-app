import * as z from "zod"

export const WishlistItemSchema = z.object({
  productId: z.uuid({ error: "Unknown product." }),
})

export type WishlistItemInput = z.input<typeof WishlistItemSchema>
