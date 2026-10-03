import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { ProductForm } from "@/components/admin/product-form"
import { buttonVariants } from "@/components/ui/button"
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin-product-list"
import { requireAdmin } from "@/lib/auth-guards"
import { listCategories } from "@/lib/categories"

export const metadata: Metadata = { title: "New product — Admin — Northcart" }

/** The product form, empty. */
export default async function NewProductPage() {
  await requireAdmin("/admin/products/new")
  const categories = await listCategories()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={ADMIN_PRODUCTS_PATH} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}>
          <ArrowLeft data-icon="inline-start" />
          Products
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">New product</h1>
      </div>
      <ProductForm product={null} categories={categories.map(({ id, name }) => ({ id, name }))} />
    </div>
  )
}
