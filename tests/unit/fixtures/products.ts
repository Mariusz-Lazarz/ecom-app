import type { ProductSummary } from "@/lib/products"

let next = 0

/** A ProductSummary with sensible defaults; override whatever a test cares about. */
export function makeProduct(overrides: Partial<ProductSummary> = {}): ProductSummary {
  next += 1
  const slug = overrides.slug ?? `product-${next}`
  return {
    id: `id-${slug}`,
    slug,
    name: `Product ${next}`,
    brand: "Halden",
    shortDescription: "A product.",
    priceCents: 14900,
    compareAtCents: null,
    currency: "USD",
    onSale: false,
    rating: 4.5,
    reviewCount: 120,
    badge: null,
    featured: false,
    inStock: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    category: { slug: "audio", name: "Audio" },
    image: { url: `http://localhost:9090/media/products/${slug}.webp`, width: 1600, height: 1200, alt: `Photo of ${slug}` },
    ...overrides,
  }
}
