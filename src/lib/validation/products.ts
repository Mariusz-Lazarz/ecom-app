import * as z from "zod"

export const PRODUCT_SORTS = ["featured", "newest", "price-asc", "price-desc", "rating"] as const
export type ProductSort = (typeof PRODUCT_SORTS)[number]

export const DEFAULT_PAGE_SIZE = 12
export const MAX_PAGE_SIZE = 48
// Deep pages are useless for a storefront and make OFFSET scans expensive.
export const MAX_PAGE = 1000
export const MAX_QUERY_LENGTH = 100

// Query strings arrive as strings, or arrays when a key repeats (Next.js page `searchParams`).
// Use the first value, trim it, and treat an empty one (`?q=`) as not set.
const param = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => {
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first !== "string") return first
    const trimmed = first.trim()
    return trimmed === "" ? undefined : trimmed
  }, schema)

/**
 * Catalogue filters as they come from a URL: `GET /api/products?…` or a storefront page's
 * `searchParams`. Unknown keys are dropped. `onSale` / `featured` accept true/false, 1/0, yes/no.
 */
export const ProductListQuerySchema = z.object({
  page: param(z.coerce.number().int().min(1).max(MAX_PAGE).default(1)),
  pageSize: param(z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)),
  q: param(z.string().max(MAX_QUERY_LENGTH).optional()),
  category: param(
    z
      .string()
      .max(64)
      .regex(/^[a-z0-9-]+$/, { error: "Must be a category slug." })
      .optional(),
  ),
  sort: param(z.enum(PRODUCT_SORTS).default("featured")),
  onSale: param(z.stringbool().optional()),
  featured: param(z.stringbool().optional()),
})

export type ProductListQuery = z.output<typeof ProductListQuerySchema>

// Turns URLSearchParams into the plain object the schema expects (repeated keys become arrays).
export function searchParamsToObject(params: URLSearchParams) {
  const out: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    out[key] = values.length === 1 ? values[0] : values
  }
  return out
}
