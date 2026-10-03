import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"
import { ChevronRight, CircleCheck, CircleX, PackageCheck, RotateCcw, Truck } from "lucide-react"

import { SectionHeading } from "@/components/home/section-heading"
import { AddToCartButton } from "@/components/products/add-to-cart-button"
import { Price } from "@/components/products/price"
import { ProductCard } from "@/components/products/product-card"
import { ProductGallery } from "@/components/products/product-gallery"
import { Rating } from "@/components/products/rating"
import { ProductReviews } from "@/components/reviews/product-reviews"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { WishlistButton } from "@/components/wishlist/wishlist-button"
import { getProductBySlug } from "@/lib/products"
import { parseProductReviewQuery, REVIEWS_ANCHOR } from "@/lib/review-utils"
import { shippingRules } from "@/lib/shipping"
import { getWishlistedIds } from "@/lib/wishlist"

// generateMetadata and the page both need the product; cache() makes that one query per request.
const loadProduct = cache(getProductBySlug)

// Shown as "Only N left" at or below this stock level.
const LOW_STOCK = 10

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const product = await loadProduct((await params).slug)
  if (!product) return { title: "Product not found — Northcart" }
  return { title: `${product.name} — Northcart`, description: product.shortDescription }
}

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[slug]">) {
  const product = await loadProduct((await params).slug)
  if (!product) notFound()
  const reviewQuery = parseProductReviewQuery(await searchParams)
  // One query marks the hearts on this product and on the related ones.
  const wishlist = await getWishlistedIds([product.id, ...product.related.map((related) => related.id)])

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <li>
              <Link href="/products" className="hover:text-foreground">
                Shop
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li>
              <Link href={`/categories/${product.category.slug}`} className="hover:text-foreground">
                {product.category.name}
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li aria-current="page" className="truncate text-foreground">
              {product.name}
            </li>
          </ol>
        </nav>

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <ProductGallery images={product.images} productName={product.name} />
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">{product.brand}</p>
                {product.badge && <Badge>{product.badge}</Badge>}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{product.name}</h1>
              <a href={`#${REVIEWS_ANCHOR}`} className="inline-flex rounded-sm hover:underline">
                <Rating rating={product.rating} reviewCount={product.reviewCount} className="text-sm" />
              </a>
            </div>

            <Price
              priceCents={product.priceCents}
              compareAtCents={product.onSale ? product.compareAtCents : null}
              currency={product.currency}
              size="lg"
            />

            <p className="text-lg text-muted-foreground">{product.shortDescription}</p>

            <StockStatus stock={product.stock} />

            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 sm:flex-none">
                <AddToCartButton
                  productId={product.id}
                  productName={product.name}
                  inStock={product.inStock}
                  stock={product.stock}
                  variant="full"
                />
              </div>
              <WishlistButton
                productId={product.id}
                productName={product.name}
                saved={wishlist?.has(product.id) ?? false}
                signedIn={wishlist !== null}
                variant="full"
              />
            </div>

            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <Truck className="size-4" /> Free shipping on orders over ${shippingRules.freeThreshold}
              </li>
              <li className="flex items-center gap-2">
                <RotateCcw className="size-4" /> 30-day free returns
              </li>
            </ul>

            <Separator />

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Description</h2>
              {product.description.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index} className="leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>

            {product.specs.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Specifications</h2>
                <table className="w-full text-sm">
                  <tbody>
                    {product.specs.map((spec) => (
                      <tr key={spec.label} className="border-b last:border-0">
                        <th scope="row" className="w-2/5 py-2 pr-4 text-left font-medium">
                          {spec.label}
                        </th>
                        <td className="py-2 text-muted-foreground">{spec.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        </div>

        <ProductReviews product={product} query={reviewQuery} />

        {product.related.length > 0 && (
          <section className="mt-16">
            <SectionHeading
              title="You may also like"
              description={`More from ${product.category.name}.`}
              href={`/categories/${product.category.slug}`}
              linkLabel={`Shop ${product.category.name}`}
            />
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {product.related.map((related) => (
                <li key={related.id} className="grid">
                  <ProductCard product={related} wishlist={wishlist} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  )
}

function StockStatus({ stock }: { stock: number }) {
  if (stock <= 0) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <CircleX className="size-4" /> Out of stock
      </p>
    )
  }
  if (stock <= LOW_STOCK) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
        <PackageCheck className="size-4" /> Only {stock} left in stock
      </p>
    )
  }
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
      <CircleCheck className="size-4" /> In stock
    </p>
  )
}
