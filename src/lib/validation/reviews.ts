import * as z from "zod"

export const MAX_REVIEW_TITLE_LENGTH = 120
export const MAX_REVIEW_BODY_LENGTH = 2000
export const MIN_REVIEW_BODY_LENGTH = 10

export const REVIEW_STATUSES = ["published", "hidden"] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export const REVIEW_SORTS = ["newest", "highest", "lowest"] as const
export type ReviewSort = (typeof REVIEW_SORTS)[number]

/** The review form (create or edit). */
export const ReviewSchema = z.object({
  rating: z.coerce
    .number({ error: "Choose a rating from 1 to 5 stars." })
    .int({ error: "Choose a rating from 1 to 5 stars." })
    .min(1, { error: "Choose a rating from 1 to 5 stars." })
    .max(5, { error: "Choose a rating from 1 to 5 stars." }),
  title: z
    .string({ error: "Give your review a title." })
    .trim()
    .min(1, { error: "Give your review a title." })
    .max(MAX_REVIEW_TITLE_LENGTH, { error: `Keep the title under ${MAX_REVIEW_TITLE_LENGTH} characters.` }),
  body: z
    .string({ error: "Tell others what you think." })
    .trim()
    .min(MIN_REVIEW_BODY_LENGTH, { error: `Write at least ${MIN_REVIEW_BODY_LENGTH} characters.` })
    .max(MAX_REVIEW_BODY_LENGTH, { error: `Keep your review under ${MAX_REVIEW_BODY_LENGTH} characters.` }),
})

export type ReviewInput = z.output<typeof ReviewSchema>
export type ReviewField = keyof ReviewInput

export type ReviewFormState =
  | {
      ok?: boolean
      errors?: Partial<Record<ReviewField, string[]>>
      // Echoed back so the form keeps what was typed.
      values?: Partial<Record<ReviewField, string>>
      message?: string
    }
  | undefined

// Query strings arrive as strings, or arrays when a key repeats; empty ones count as not set.
const param = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => {
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first !== "string") return first
    const trimmed = first.trim()
    return trimmed === "" ? undefined : trimmed
  }, schema)

export const DEFAULT_REVIEWS_SHOWN = 5
export const MAX_REVIEWS_SHOWN = 200

/** The product page's review list params: `?reviewSort=` and `?reviews=` (how many are shown). */
export const ProductReviewQuerySchema = z.object({
  reviewSort: param(z.enum(REVIEW_SORTS).default("newest")),
  reviews: param(z.coerce.number().int().min(1).max(MAX_REVIEWS_SHOWN).default(DEFAULT_REVIEWS_SHOWN)),
})

export const DEFAULT_ADMIN_REVIEWS_PAGE_SIZE = 20

/** The admin review list's filters as they come from a URL (`searchParams`). */
export const AdminReviewListQuerySchema = z.object({
  status: param(z.enum(REVIEW_STATUSES).optional()),
  rating: param(z.coerce.number().int().min(1).max(5).optional()),
  // Matches the product name, the author's email or name, or the review title.
  q: param(z.string().max(100).optional()),
  page: param(z.coerce.number().int().min(1).max(1000).default(1)),
  pageSize: param(z.coerce.number().int().min(1).max(100).default(DEFAULT_ADMIN_REVIEWS_PAGE_SIZE)),
})

export type AdminReviewListQuery = z.output<typeof AdminReviewListQuerySchema>
