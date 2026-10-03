import { SectionHeading } from "@/components/home/section-heading"
import { ProductCard } from "@/components/products/product-card"
import { listProducts } from "@/lib/products"

export const FEATURED_LIMIT = 8

export async function FeaturedProducts() {
  const { items } = await listProducts({ featured: true, pageSize: FEATURED_LIMIT })

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionHeading
        title="Featured products"
        description="Hand-picked favourites our customers keep coming back for."
        href="/products"
        linkLabel="View all products"
      />
      <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((product) => (
          <li key={product.id} className="grid">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  )
}
