import type { Cart, CartItem } from "@/lib/cart"
import { summarize } from "@/lib/cart-state"

let next = 0

/** A CartItem with consistent derived fields (line total, available, limited); override what a test cares about. */
export function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  next += 1
  const slug = overrides.slug ?? `cart-product-${next}`
  const base = {
    productId: `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`,
    slug,
    name: `Cart product ${next}`,
    brand: "Halden",
    image: { url: `http://localhost:9090/media/products/${slug}.webp`, width: 800, height: 800, alt: `Photo of ${slug}` },
    priceCents: 1000,
    compareAtCents: null,
    onSale: false,
    currency: "USD",
    quantity: 1,
    stock: 10,
    ...overrides,
  }
  return {
    ...base,
    lineTotalCents: base.priceCents * base.quantity,
    available: base.stock > 0,
    limited: base.stock > 0 && base.quantity > base.stock,
  }
}

/** A cart whose totals are computed from its items, the way getCart() computes them. */
export function makeCart(items: CartItem[]): Cart {
  return summarize(items, "USD")
}
