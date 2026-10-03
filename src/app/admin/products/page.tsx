import type { Metadata } from "next"
import Link from "next/link"
import { Plus, SearchX } from "lucide-react"

import { AdminProductTable } from "@/components/admin/admin-product-table"
import { ProductFilters } from "@/components/admin/product-filters"
import { PaginationNav } from "@/components/pagination-nav"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { adminProductsHref, parseAdminProductQuery } from "@/lib/admin-product-list"
import { listAdminProducts } from "@/lib/admin-products"
import { requireAdmin } from "@/lib/auth-guards"
import { listCategories } from "@/lib/categories"

export const metadata: Metadata = { title: "Products — Admin — Northcart" }

/**
 * Every product, newest first, searched by `?q=` (name, brand or slug), filtered by `?category=`
 * and `?stock=low`, paginated with `?page=`. Invalid params fall back to their defaults.
 */
export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin("/admin/products")
  const query = parseAdminProductQuery(await searchParams)
  const [list, categories] = await Promise.all([listAdminProducts(query), listCategories()])

  const filtered = Boolean(query.q || query.category || query.stock)
  const categoryName = categories.find((category) => category.slug === query.category)?.name
  const showing =
    list.total === 0
      ? null
      : `${list.total} ${list.total === 1 ? "product" : "products"}${categoryName ? ` in ${categoryName}` : ""}${query.stock ? " · low stock" : ""}${query.q ? ` matching “${query.q}”` : ""}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
        <Link href="/admin/products/new" className={buttonVariants()}>
          <Plus data-icon="inline-start" />
          New product
        </Link>
      </div>

      <ProductFilters query={query} categories={categories} />

      {list.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <SearchX className="size-6" />
            </span>
            <p className="text-lg font-semibold">{list.total === 0 ? "No products found" : "Nothing on this page"}</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {list.total > 0
                ? `There ${list.pageCount === 1 ? "is only 1 page" : `are only ${list.pageCount} pages`} of products.`
                : filtered
                  ? "No products match these filters."
                  : "Add your first product to start selling."}
            </p>
            {(filtered || list.total > 0) && (
              <Link
                href={list.total > 0 ? adminProductsHref({ ...query, page: 1 }) : adminProductsHref()}
                className={buttonVariants({ variant: "outline", className: "mt-2" })}
              >
                {list.total > 0 ? "Go to the first page" : "Clear filters"}
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {showing}
          </p>
          <AdminProductTable products={list.items} />
        </div>
      )}

      <PaginationNav
        page={query.page}
        pageCount={list.pageCount}
        href={(page) => adminProductsHref({ ...query, page })}
      />
    </div>
  )
}
