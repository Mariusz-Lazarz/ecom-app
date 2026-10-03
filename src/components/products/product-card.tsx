import Image from "next/image"
import Link from "next/link"
import { ImageOff } from "lucide-react"

import { AddToCartButton } from "@/components/products/add-to-cart-button"
import { Price } from "@/components/products/price"
import { Rating } from "@/components/products/rating"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { ProductSummary } from "@/lib/products"
import { cn } from "@/lib/utils"

type ProductCardProps = {
  product: ProductSummary
  // Set on cards above the fold so their photo isn't lazy-loaded.
  eager?: boolean
}

export function ProductCard({ product, eager = false }: ProductCardProps) {
  const href = `/products/${product.slug}`
  return (
    <Card className="group relative gap-0 py-0">
      {/* Duplicate of the title link for pointer users; hidden from AT and tab order to avoid announcing it twice */}
      <Link
        href={href}
        aria-hidden
        tabIndex={-1}
        className="relative block aspect-square overflow-hidden bg-muted"
      >
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt}
            fill
            loading={eager ? "eager" : undefined}
            sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className={cn(
              "object-cover transition-transform duration-500 group-hover:scale-105",
              !product.inStock && "opacity-60 grayscale",
            )}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" />
          </span>
        )}
      </Link>
      <div className="absolute top-3 left-3 flex flex-col items-start gap-1">
        {product.badge && <Badge>{product.badge}</Badge>}
        {!product.inStock && <Badge variant="secondary">Out of stock</Badge>}
      </div>
      <CardContent className="flex flex-1 flex-col gap-2 py-4">
        <p className="text-xs text-muted-foreground">{product.brand}</p>
        <Link href={href} className="font-medium hover:underline">
          {product.name}
        </Link>
        <Rating rating={product.rating} reviewCount={product.reviewCount} />
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Price
            priceCents={product.priceCents}
            compareAtCents={product.onSale ? product.compareAtCents : null}
            currency={product.currency}
          />
          <AddToCartButton productName={product.name} inStock={product.inStock} />
        </div>
      </CardContent>
    </Card>
  )
}
