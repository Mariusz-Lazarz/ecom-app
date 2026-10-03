import {
  AdminReviewListQuerySchema,
  DEFAULT_ADMIN_REVIEWS_PAGE_SIZE,
  DEFAULT_REVIEWS_SHOWN,
  ProductReviewQuerySchema,
  type AdminReviewListQuery,
  type ReviewSort,
} from "@/lib/validation/reviews"

// Pure helpers for reviews (product page and admin list). Client-safe.

export type RatingStar = 1 | 2 | 3 | 4 | 5

/** Published review counts per star rating. */
export type RatingCounts = Record<RatingStar, number>

export type RatingSummary = {
  // Rounded to one decimal, like products.rating; 0 without reviews.
  average: number
  total: number
  // 5 stars first, each with its share of all reviews in whole percent (0 without reviews).
  distribution: { stars: RatingStar; count: number; percent: number }[]
}

export const STARS: readonly RatingStar[] = [5, 4, 3, 2, 1]

export const emptyRatingCounts = (): RatingCounts => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })

/**
 * The review summary from per-star counts. The average is rounded half up to one decimal on the
 * exact fraction, which matches Postgres's `round(avg(rating), 1)` used for products.rating.
 */
export function summarizeRatings(counts: RatingCounts): RatingSummary {
  const total = STARS.reduce((sum, stars) => sum + counts[stars], 0)
  const points = STARS.reduce((sum, stars) => sum + stars * counts[stars], 0)
  return {
    average: total === 0 ? 0 : Math.round((points * 10) / total) / 10,
    total,
    distribution: STARS.map((stars) => ({
      stars,
      count: counts[stars],
      percent: total === 0 ? 0 : Math.round((counts[stars] / total) * 100),
    })),
  }
}

/** How a review's author is shown publicly: first name and last initial ("Anna K."). */
export function reviewerName(firstName: string, lastName: string) {
  const initial = lastName.trim().charAt(0).toUpperCase()
  return initial ? `${firstName.trim()} ${initial}.` : firstName.trim()
}

export const REVIEW_SORT_OPTIONS: { value: ReviewSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest rated" },
  { value: "lowest", label: "Lowest rated" },
]

/** The id of the product page's reviews section, and of the review form inside it. */
export const REVIEWS_ANCHOR = "reviews"
export const REVIEW_FORM_ANCHOR = "write-review"

export type ProductReviewQuery = { sort: ReviewSort; shown: number }

/** Reads the product page's review params; invalid ones fall back to their defaults. */
export function parseProductReviewQuery(
  searchParams: Record<string, string | string[] | undefined>,
): ProductReviewQuery {
  const input: Record<string, unknown> = { ...searchParams }
  let result = ProductReviewQuerySchema.safeParse(input)
  if (!result.success) {
    for (const issue of result.error.issues) delete input[String(issue.path[0])]
    result = ProductReviewQuerySchema.safeParse(input)
  }
  const data = result.success ? result.data : ProductReviewQuerySchema.parse({})
  return { sort: data.reviewSort, shown: data.reviews }
}

/** A link to the product page's reviews with this sort and number shown; defaults are left out. */
export function productReviewsHref(slug: string, { sort, shown }: Partial<ProductReviewQuery> = {}) {
  const params = new URLSearchParams()
  if (sort && sort !== "newest") params.set("reviewSort", sort)
  if (shown && shown !== DEFAULT_REVIEWS_SHOWN) params.set("reviews", String(shown))
  const search = params.toString()
  return `/products/${slug}${search ? `?${search}` : ""}#${REVIEWS_ANCHOR}`
}

/** The product page's review form (write or edit). */
export const reviewFormHref = (slug: string) => `/products/${slug}#${REVIEW_FORM_ANCHOR}`

export const ADMIN_REVIEWS_PATH = "/admin/reviews"

const ADMIN_DEFAULTS = AdminReviewListQuerySchema.parse({})

/** Reads the admin review list's `searchParams`; a param that fails validation falls back to its default. */
export function parseAdminReviewQuery(searchParams: Record<string, string | string[] | undefined>): AdminReviewListQuery {
  const input: Record<string, unknown> = { ...searchParams }
  let result = AdminReviewListQuerySchema.safeParse(input)
  if (!result.success) {
    for (const issue of result.error.issues) delete input[String(issue.path[0])]
    result = AdminReviewListQuerySchema.safeParse(input)
  }
  const { status, rating, q, page, pageSize } = result.success ? result.data : ADMIN_DEFAULTS
  return { status, rating, q, page, pageSize }
}

/** A link to the admin review list with these filters; defaults are left out. */
export function adminReviewsHref(query: Partial<AdminReviewListQuery> = {}) {
  const params = new URLSearchParams()
  if (query.status) params.set("status", query.status)
  if (query.rating) params.set("rating", String(query.rating))
  if (query.q) params.set("q", query.q)
  if (query.pageSize && query.pageSize !== DEFAULT_ADMIN_REVIEWS_PAGE_SIZE) params.set("pageSize", String(query.pageSize))
  if (query.page && query.page > 1) params.set("page", String(query.page))
  const search = params.toString()
  return search ? `${ADMIN_REVIEWS_PATH}?${search}` : ADMIN_REVIEWS_PATH
}
