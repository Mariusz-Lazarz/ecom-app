import {
  AdminProductListQuerySchema,
  DEFAULT_ADMIN_PRODUCTS_PAGE_SIZE,
  type AdminProductListQuery,
} from "@/lib/validation/admin-products"

// Pure helpers for the admin product list (/admin/products). Client-safe.

export const ADMIN_PRODUCTS_PATH = "/admin/products"

const DEFAULTS = AdminProductListQuerySchema.parse({})

/**
 * Reads the admin product list's `searchParams`. A param that fails validation is dropped and
 * falls back to its default, so a bad link (`?stock=none&page=0`) still shows the list.
 */
export function parseAdminProductQuery(
  searchParams: Record<string, string | string[] | undefined>,
): AdminProductListQuery {
  const input: Record<string, unknown> = { ...searchParams }
  let result = AdminProductListQuerySchema.safeParse(input)
  if (!result.success) {
    for (const issue of result.error.issues) delete input[String(issue.path[0])]
    result = AdminProductListQuerySchema.safeParse(input)
  }
  const { q, category, stock, page, pageSize } = result.success ? result.data : DEFAULTS
  return { q, category, stock, page, pageSize }
}

/** A link to the admin product list with these filters; defaults are left out. */
export function adminProductsHref(query: Partial<AdminProductListQuery> = {}) {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.category) params.set("category", query.category)
  if (query.stock) params.set("stock", query.stock)
  if (query.pageSize && query.pageSize !== DEFAULT_ADMIN_PRODUCTS_PAGE_SIZE) {
    params.set("pageSize", String(query.pageSize))
  }
  if (query.page && query.page > 1) params.set("page", String(query.page))
  const search = params.toString()
  return search ? `${ADMIN_PRODUCTS_PATH}?${search}` : ADMIN_PRODUCTS_PATH
}

/** The edit page of a product. */
export const adminProductHref = (id: string) => `${ADMIN_PRODUCTS_PATH}/${id}`
