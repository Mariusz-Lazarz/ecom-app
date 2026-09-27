import Image from "next/image"
import Link from "next/link"
import { Plus, Star } from "lucide-react"

import { SectionHeading } from "@/components/home/section-heading"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { featuredProducts, type Product } from "@/lib/data"

const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)

function ProductCard({ product }: { product: Product }) {
  return (
    <Card className="group relative gap-0 py-0">
      {/* Duplicate of the title link for pointer users; hidden from AT and tab order to avoid announcing it twice */}
      <Link
        href={`/products/${product.slug}`}
        aria-hidden
        tabIndex={-1}
        className="relative block aspect-square overflow-hidden bg-muted"
      >
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </Link>
      {product.badge && <Badge className="absolute top-3 left-3">{product.badge}</Badge>}
      <CardContent className="flex flex-1 flex-col gap-2 py-4">
        <p className="text-xs text-muted-foreground">{product.category}</p>
        <Link href={`/products/${product.slug}`} className="font-medium hover:underline">
          {product.name}
        </Link>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="size-3.5 fill-amber-400 text-amber-400" />
          <span className="font-medium text-foreground">{product.rating}</span>
          <span>({product.reviews})</span>
        </div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold">{formatPrice(product.price)}</span>
            {product.compareAt && (
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(product.compareAt)}
              </span>
            )}
          </div>
          <Button size="icon" variant="outline" aria-label={`Add ${product.name} to cart`}>
            <Plus />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function FeaturedProducts() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionHeading
        title="Featured products"
        description="Hand-picked favourites our customers keep coming back for."
        href="/products"
        linkLabel="View all products"
      />
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {featuredProducts.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  )
}
