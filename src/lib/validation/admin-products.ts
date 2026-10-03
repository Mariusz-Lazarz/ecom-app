import * as z from "zod"

// The admin product form and the admin product list's URL filters. Client-safe.

export const MAX_NAME_LENGTH = 120
export const MAX_SLUG_LENGTH = 100
export const MAX_BRAND_LENGTH = 60
export const MAX_SHORT_DESCRIPTION_LENGTH = 300
export const MAX_DESCRIPTION_LENGTH = 5000
export const MAX_BADGE_LENGTH = 24
export const MAX_SPECS = 30
export const MAX_SPEC_LABEL_LENGTH = 60
export const MAX_SPEC_VALUE_LENGTH = 200
export const MAX_IMAGES = 12
export const MAX_ALT_LENGTH = 200
export const MAX_STOCK = 1_000_000
// $1,000,000.00, well inside Postgres' integer.
export const MAX_PRICE_CENTS = 100_000_000
// Products at or below this stock count as "Low" in the admin (0 is "Out").
export const LOW_STOCK_THRESHOLD = 10

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
// What `uploadImage(bytes, "products")` stores: a content hash under the products folder.
export const PRODUCT_IMAGE_KEY_PATTERN = /^products\/[a-f0-9]{32}\.webp$/

/** A URL slug from a product name: lower-case ASCII words joined by dashes ("Café Mug 2" → "cafe-mug-2"). */
export function slugify(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "")
}

/** Dollars as typed in the form ("12", "12.5", "1,299.99") to cents, or null when it isn't an amount. */
export function dollarsToCents(input: string): number | null {
  const value = input.trim().replace(/^\$/, "")
  // Commas only as thousands separators, so "12,5" isn't read as 125.
  if (value.includes(",") && !/^\d{1,3}(,\d{3})+(\.|$)/.test(value)) return null
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.replace(/,/g, ""))
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"))
}

/** Cents as the form shows them: 1250 → "12.50". */
export function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2)
}

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(max, { error: `${label} must be at most ${max} characters.` })

const money = (label: string) =>
  z.string({ error: `${label} is required.` }).transform((value, ctx) => {
    const cents = dollarsToCents(value)
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: `${label} must be an amount like 49 or 49.99.` })
      return z.NEVER
    }
    if (cents > MAX_PRICE_CENTS) {
      ctx.addIssue({ code: "custom", message: `${label} must be at most $${MAX_PRICE_CENTS / 100}.` })
      return z.NEVER
    }
    return cents
  })

const SpecSchema = z.object({
  label: text("Label", MAX_SPEC_LABEL_LENGTH),
  value: text("Value", MAX_SPEC_VALUE_LENGTH),
})

const ImageSchema = z.object({
  key: z.string().regex(PRODUCT_IMAGE_KEY_PATTERN, { error: "Upload the image again." }),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  // Blank means "use the product name".
  alt: z.string().trim().max(MAX_ALT_LENGTH, { error: `Alt text must be at most ${MAX_ALT_LENGTH} characters.` }),
})

/**
 * The product form after parsing: prices in cents, empty optional fields as null, image alt text
 * defaulting to the product name. The compare-at ("was") price must be above the price.
 */
export const ProductFormSchema = z
  .object({
    name: text("Name", MAX_NAME_LENGTH),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, { error: "Slug is required.", abort: true })
      .max(MAX_SLUG_LENGTH, { error: `Slug must be at most ${MAX_SLUG_LENGTH} characters.` })
      .regex(SLUG_PATTERN, { error: "Use lower-case letters, digits and single dashes." }),
    brand: text("Brand", MAX_BRAND_LENGTH),
    categoryId: z.uuid({ error: "Choose a category." }),
    shortDescription: text("Short description", MAX_SHORT_DESCRIPTION_LENGTH),
    description: text("Description", MAX_DESCRIPTION_LENGTH),
    price: money("Price"),
    compareAt: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined)
      .pipe(money("Compare-at price").optional())
      .transform((value) => value ?? null),
    stock: z
      .string({ error: "Stock is required." })
      .trim()
      .regex(/^\d+$/, { error: "Stock must be a whole number, 0 or more." })
      .transform(Number)
      .pipe(z.number().max(MAX_STOCK, { error: `Stock must be at most ${MAX_STOCK}.` })),
    badge: z
      .string()
      .trim()
      .max(MAX_BADGE_LENGTH, { error: `Badge must be at most ${MAX_BADGE_LENGTH} characters.` })
      .optional()
      .transform((value) => value || null),
    featured: z.boolean(),
    specs: z.array(SpecSchema).max(MAX_SPECS, { error: `At most ${MAX_SPECS} specs.` }),
    images: z.array(ImageSchema).max(MAX_IMAGES, { error: `At most ${MAX_IMAGES} images.` }),
  })
  .refine((data) => data.compareAt === null || data.compareAt > data.price, {
    error: "Compare-at price must be higher than the price, or empty.",
    path: ["compareAt"],
  })
  .transform((data) => ({
    ...data,
    images: data.images.map((image) => ({ ...image, alt: image.alt || data.name })),
  }))

export type ProductInput = z.output<typeof ProductFormSchema>
export type ProductSpecInput = ProductInput["specs"][number]
export type ProductImageInput = ProductInput["images"][number]

export const PRODUCT_FORM_FIELDS = [
  "name",
  "slug",
  "brand",
  "categoryId",
  "shortDescription",
  "description",
  "price",
  "compareAt",
  "stock",
  "badge",
  "featured",
  "specs",
  "images",
] as const

export type ProductFormField = (typeof PRODUCT_FORM_FIELDS)[number]

/** What the product form posts, as strings (specs and images travel as JSON). */
export type ProductFormValues = Partial<Record<Exclude<ProductFormField, "featured">, string>> & {
  featured?: boolean
}

export type ProductFormState =
  | {
      errors?: Partial<Record<ProductFormField, string[]>>
      message?: string
      values?: ProductFormValues
    }
  | undefined

/**
 * Field errors keyed by top-level field. Errors inside the specs or images lists name the row
 * ("Row 2: Label is required.") and are grouped under `specs` / `images`.
 */
export function productFieldErrors(error: z.ZodError): Partial<Record<ProductFormField, string[]>> {
  const errors: Partial<Record<ProductFormField, string[]>> = {}
  for (const issue of error.issues) {
    const [field, index] = issue.path
    if (typeof field !== "string") continue
    const message =
      (field === "specs" || field === "images") && typeof index === "number"
        ? `${field === "specs" ? "Row" : "Image"} ${index + 1}: ${issue.message}`
        : issue.message
    const list = (errors[field as ProductFormField] ??= [])
    if (!list.includes(message)) list.push(message)
  }
  return errors
}

// Query strings arrive as strings, or arrays when a key repeats; empty ones count as not set.
const param = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => {
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first !== "string") return first
    const trimmed = first.trim()
    return trimmed === "" ? undefined : trimmed
  }, schema)

export const DEFAULT_ADMIN_PRODUCTS_PAGE_SIZE = 20
export const MAX_ADMIN_PRODUCTS_PAGE_SIZE = 100
export const MAX_ADMIN_PRODUCTS_PAGE = 1000

/** The admin product list's filters as they come from a URL (`searchParams`). */
export const AdminProductListQuerySchema = z.object({
  // Part of the name, brand or slug.
  q: param(z.string().max(100).optional()),
  category: param(z.string().max(64).regex(SLUG_PATTERN).optional()),
  // `stock=low`: only products at or below LOW_STOCK_THRESHOLD.
  stock: param(z.literal("low").optional()),
  page: param(z.coerce.number().int().min(1).max(MAX_ADMIN_PRODUCTS_PAGE).default(1)),
  pageSize: param(
    z.coerce.number().int().min(1).max(MAX_ADMIN_PRODUCTS_PAGE_SIZE).default(DEFAULT_ADMIN_PRODUCTS_PAGE_SIZE),
  ),
})

export type AdminProductListQuery = z.output<typeof AdminProductListQuerySchema>
