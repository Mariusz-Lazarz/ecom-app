import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"
import { ArrowLeft, ExternalLink } from "lucide-react"
import * as z from "zod"

import { DeleteProductButton } from "@/components/admin/delete-product-button"
import { ProductForm } from "@/components/admin/product-form"
import { buttonVariants } from "@/components/ui/button"
import { ADMIN_PRODUCTS_PATH, adminProductHref } from "@/lib/admin-product-list"
import { getAdminProduct } from "@/lib/admin-products"
import { requireAdmin } from "@/lib/auth-guards"
import { listCategories } from "@/lib/categories"

const ProductId = z.uuid()

// generateMetadata and the page both need the product; cache() makes that one query per request.
// Anything that isn't a UUID can't be a product id, so it never reaches the database.
const loadProduct = cache(async (id: string) => (ProductId.safeParse(id).success ? getAdminProduct(id) : null))

export async function generateMetadata({ params }: PageProps<"/admin/products/[id]">): Promise<Metadata> {
  const { id } = await params
  await requireAdmin(adminProductHref(encodeURIComponent(id)))
  const product = await loadProduct(id)
  return { title: `${product ? product.name : "Product not found"} — Admin — Northcart` }
}

/** The product form for an existing product, with links to its store page and a delete button. */
export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = await params
  await requireAdmin(adminProductHref(encodeURIComponent(id)))
  const [product, categories] = await Promise.all([loadProduct(id), listCategories()])
  if (!product) notFound()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={ADMIN_PRODUCTS_PATH} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}>
          <ArrowLeft data-icon="inline-start" />
          Products
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 text-3xl font-semibold tracking-tight break-words">{product.name}</h1>
          <div className="flex items-center gap-2">
            <Link
              href={`/products/${product.slug}`}
              target="_blank"
              className={buttonVariants({ variant: "outline" })}
            >
              <ExternalLink data-icon="inline-start" />
              View in store
            </Link>
            <DeleteProductButton id={product.id} name={product.name} orderLineCount={product.orderLineCount} />
          </div>
        </div>
      </div>
      <ProductForm product={product} categories={categories.map(({ id, name }) => ({ id, name }))} />
    </div>
  )
}
