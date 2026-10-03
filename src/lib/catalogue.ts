import {
  DEFAULT_PAGE_SIZE,
  ProductListQuerySchema,
  type ProductListQuery,
  type ProductSort,
} from "@/lib/validation/products"

// Helpers shared by the catalogue pages (/products, /categories/[slug]). Pure, so they run anywhere.

export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
]

/** The filters a catalogue URL can carry. `category` is set by the route on /categories/[slug]. */
export type CatalogueQuery = Pick<ProductListQuery, "page" | "pageSize" | "q" | "category" | "sort" | "onSale">

const DEFAULTS = ProductListQuerySchema.parse({})

/**
 * Reads a page's `searchParams` into catalogue filters. A param that fails validation is dropped
 * and falls back to its default, so a bad link (`?sort=cheapest&page=-1`) still shows the catalogue.
 */
export function parseCatalogueQuery(searchParams: Record<string, string | string[] | undefined>): CatalogueQuery {
  const input: Record<string, unknown> = { ...searchParams }
  let result = ProductListQuerySchema.safeParse(input)
  if (!result.success) {
    for (const issue of result.error.issues) delete input[String(issue.path[0])]
    result = ProductListQuerySchema.safeParse(input)
  }
  const { page, pageSize, q, category, sort, onSale } = result.success ? result.data : DEFAULTS
  return { page, pageSize, q, category, sort, onSale }
}

/**
 * Builds a catalogue link from `base` (e.g. "/products") and filters. Defaults are left out, so
 * links stay short and one filter state has one URL.
 */
export function catalogueHref(base: string, query: Partial<CatalogueQuery>) {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.category) params.set("category", query.category)
  if (query.sort && query.sort !== "featured") params.set("sort", query.sort)
  if (query.onSale) params.set("onSale", "true")
  if (query.pageSize && query.pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(query.pageSize))
  if (query.page && query.page > 1) params.set("page", String(query.page))
  const search = params.toString()
  return search ? `${base}?${search}` : base
}

export type PaginationItem = number | "ellipsis"

/**
 * Page numbers to show: always the first and last page, the current page with `siblings` on each
 * side, and "ellipsis" for each gap of two or more pages (a gap of one shows that page instead).
 */
export function paginationRange(page: number, pageCount: number, siblings = 1): PaginationItem[] {
  if (pageCount <= 0) return []
  const current = Math.min(Math.max(page, 1), pageCount)
  const start = Math.max(2, current - siblings)
  const end = Math.min(pageCount - 1, current + siblings)

  const items: PaginationItem[] = [1]
  if (start > 3) items.push("ellipsis")
  else for (let p = 2; p < start; p++) items.push(p)
  for (let p = start; p <= end; p++) items.push(p)
  if (end < pageCount - 2) items.push("ellipsis")
  else for (let p = end + 1; p < pageCount; p++) items.push(p)
  if (pageCount > 1) items.push(pageCount)
  return items
}

/** Formats an amount in minor units (cents) as a price, e.g. 14900 → "$149.00". */
export function formatPrice(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100)
}

/** Whole-percent discount of a sale price against its "was" price, or null when it isn't a discount. */
export function discountPercent(priceCents: number, compareAtCents: number | null) {
  if (compareAtCents === null || compareAtCents <= priceCents || compareAtCents <= 0) return null
  return Math.round((1 - priceCents / compareAtCents) * 100)
}
