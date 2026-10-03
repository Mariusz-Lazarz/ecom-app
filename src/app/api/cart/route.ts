import { withErrorHandler } from "@/lib/api/handler"
import { getCart } from "@/lib/cart"

// The current visitor's cart (session or `cart_id` cookie), for client components such as a mini-cart.
export const GET = withErrorHandler(async () => {
  return Response.json({ cart: await getCart() })
})
