import Link from "next/link"
import { Check, SearchX, X } from "lucide-react"

import { Pagination } from "@/components/products/pagination"
import { ProductCard } from "@/components/products/product-card"
import { SortSelect } from "@/components/products/sort-select"
import { buttonVariants } from "@/components/ui/button"
import type { Category } from "@/lib/categories"
import { catalogueHref, type CatalogueQuery } from "@/lib/catalogue"
import type { ProductList } from "@/lib/products"
import { cn } from "@/lib/utils"

type CatalogueProps = {
  // The route the filters link back to: "/products" or "/categories/<slug>".
  basePath: string
  title: string
  description?: string
  // Filters from the URL. On /categories/<slug> the category comes from the route, not from here.
  query: CatalogueQuery
  // The category being shown, from the route or from `?category=`.
  activeCategory?: string
  categories: Category[]
  list: ProductList
}

/** The product listing shared by /products and /categories/[slug]. All filter state lives in the URL. */
export function Catalogue({ basePath, title, description, query, activeCategory, categories, list }: CatalogueProps) {
  // Switching category keeps the search, sort and sale filter but starts again at page 1.
  const carried = { q: query.q, sort: query.sort, onSale: query.onSale }
  const first = (list.page - 1) * list.pageSize + 1
  const last = first + list.items.length - 1

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[13rem_1fr]">
        <aside aria-label="Filters" className="min-w-0 space-y-3 lg:space-y-6">
          <nav aria-label="Categories">
            <h2 className="sr-only text-sm font-semibold lg:not-sr-only lg:mb-2">Category</h2>
            {/* A scrollable row of chips on small screens, a vertical list from lg up */}
            <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
              {[{ slug: undefined, name: "All" }, ...categories].map((category) => {
                const active = category.slug === activeCategory
                const href = category.slug
                  ? catalogueHref(`/categories/${category.slug}`, carried)
                  : catalogueHref("/products", carried)
                return (
                  <li key={category.slug ?? "all"} className="shrink-0">
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors lg:rounded-md lg:border-transparent lg:py-1.5",
                        active
                          ? "border-primary bg-primary text-primary-foreground lg:border-transparent"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {category.name}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div>
            <h2 className="sr-only text-sm font-semibold lg:not-sr-only lg:mb-2">Offers</h2>
            <Link
              href={catalogueHref(basePath, { ...query, onSale: !query.onSale, page: 1 })}
              aria-current={query.onSale ? "true" : undefined}
              className="flex items-center gap-2 rounded-md py-1 text-sm hover:text-foreground"
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-4 items-center justify-center rounded border",
                  query.onSale ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {query.onSale && <Check className="size-3" />}
              </span>
              On sale only
            </Link>
          </div>
        </aside>

        <section aria-label="Products" className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <p className="text-muted-foreground" role="status">
                {list.total === 0
                  ? "No products"
                  : list.items.length === 0
                    ? `${list.total} ${list.total === 1 ? "product" : "products"}`
                    : `Showing ${first}–${last} of ${list.total} ${list.total === 1 ? "product" : "products"}`}
              </p>
              {query.q && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-3">
                  Results for <span className="font-medium">“{query.q}”</span>
                  <Link
                    href={catalogueHref(basePath, { ...query, q: undefined, page: 1 })}
                    aria-label="Clear search"
                    className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </Link>
                </span>
              )}
            </div>
            <SortSelect basePath={basePath} query={query} />
          </div>

          {list.items.length > 0 ? (
            <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {list.items.map((product, index) => (
                <li key={product.id} className="grid">
                  <ProductCard product={product} eager={index < 3} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={list.total === 0 ? "No products match your filters" : "This page is empty"}
              description={
                list.total === 0
                  ? "Try a different search term or remove a filter."
                  : `There are only ${list.pageCount} ${list.pageCount === 1 ? "page" : "pages"} of results.`
              }
              href={
                list.total === 0
                  ? basePath
                  : catalogueHref(basePath, { ...query, page: 1 })
              }
              linkLabel={list.total === 0 ? "Clear filters" : "Go to the first page"}
            />
          )}

          <Pagination basePath={basePath} query={query} pageCount={list.pageCount} />
        </section>
      </div>
    </div>
  )
}

function EmptyState({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string
  description: string
  href: string
  linkLabel: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <SearchX className="size-5 text-muted-foreground" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <Link href={href} className={buttonVariants({ variant: "outline", className: "mt-2" })}>
        {linkLabel}
      </Link>
    </div>
  )
}
