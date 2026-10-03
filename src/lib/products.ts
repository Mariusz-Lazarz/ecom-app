import "server-only"

import { connection } from "next/server"

import { query } from "@/lib/db"
import { mediaUrl } from "@/lib/storage"
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type ProductListQuery,
  type ProductSort,
} from "@/lib/validation/products"

export type ProductImage = {
  url: string
  width: number
  height: number
  alt: string
}

export type ProductCategory = {
  slug: string
  name: string
}

// What a product card needs.
export type ProductSummary = {
  id: string
  slug: string
  name: string
  brand: string
  shortDescription: string
  priceCents: number
  // The "was" price, or null. `onSale` is true when it's above `priceCents`.
  compareAtCents: number | null
  currency: string
  onSale: boolean
  rating: number
  reviewCount: number
  badge: string | null
  featured: boolean
  inStock: boolean
  createdAt: Date
  category: ProductCategory
  // The primary image (position 0), or null when the product has none.
  image: ProductImage | null
}

export type ProductSpec = { label: string; value: string }

export type ProductDetail = Omit<ProductSummary, "image"> & {
  description: string
  stock: number
  specs: ProductSpec[]
  // Ordered by position; the first one is the primary image.
  images: ProductImage[]
  // A few other products from the same category.
  related: ProductSummary[]
}

export type ProductList = {
  items: ProductSummary[]
  page: number
  pageSize: number
  total: number
  // 0 when nothing matches. A `page` above it returns no items.
  pageCount: number
}

export type ListProductsOptions = Partial<ProductListQuery>

export const RELATED_LIMIT = 4
const MAX_SEARCH_TERMS = 5

type SummaryRow = {
  id: string
  slug: string
  name: string
  brand: string
  short_description: string
  price_cents: number
  compare_at_cents: number | null
  currency: string
  rating: number
  review_count: number
  badge: string | null
  featured: boolean
  stock: number
  created_at: Date
  category_slug: string
  category_name: string
  image_key: string | null
  image_width: number | null
  image_height: number | null
  image_alt: string | null
}

const SUMMARY_COLUMNS = `
  p.id, p.slug, p.name, p.brand, p.short_description, p.price_cents, p.compare_at_cents,
  p.currency, p.rating::float8 AS rating, p.review_count, p.badge, p.featured, p.stock, p.created_at,
  c.slug AS category_slug, c.name AS category_name,
  img.storage_key AS image_key, img.width AS image_width, img.height AS image_height, img.alt AS image_alt`

const SUMMARY_FROM = `
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT storage_key, width, height, alt FROM product_images
    WHERE product_id = p.id ORDER BY position LIMIT 1
  ) img ON true`

const SUMMARY_SELECT = `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM}`

// Every ORDER BY ends with the slug, so pages never overlap or skip rows when values tie.
const ORDER_BY: Record<ProductSort, string> = {
  featured: "p.featured DESC, p.rating DESC, p.review_count DESC, p.created_at DESC",
  newest: "p.created_at DESC",
  "price-asc": "p.price_cents ASC",
  "price-desc": "p.price_cents DESC",
  rating: "p.rating DESC, p.review_count DESC",
}

// Makes user input literal inside an ILIKE pattern (backslash is Postgres's default LIKE escape).
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&")
}

function toImage(key: string, width: number, height: number, alt: string): ProductImage {
  return { url: mediaUrl(key), width, height, alt }
}

function summaryFields(row: SummaryRow): Omit<ProductSummary, "image"> {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    shortDescription: row.short_description,
    priceCents: row.price_cents,
    compareAtCents: row.compare_at_cents,
    currency: row.currency,
    onSale: row.compare_at_cents !== null && row.compare_at_cents > row.price_cents,
    rating: row.rating,
    reviewCount: row.review_count,
    badge: row.badge,
    featured: row.featured,
    inStock: row.stock > 0,
    createdAt: row.created_at,
    category: { slug: row.category_slug, name: row.category_name },
  }
}

function toSummary(row: SummaryRow): ProductSummary {
  return {
    ...summaryFields(row),
    image:
      row.image_key === null
        ? null
        : toImage(row.image_key, row.image_width!, row.image_height!, row.image_alt!),
  }
}

const clampInt = (value: number | undefined, min: number, max: number, fallback: number) =>
  value === undefined || !Number.isFinite(value) ? fallback : Math.min(max, Math.max(min, Math.floor(value)))

/**
 * One page of the catalogue. Filters combine with AND:
 * - `q`: every whitespace-separated word (up to five) must appear in the name, brand or descriptions,
 *   case-insensitively.
 * - `category`: a category slug. An unknown slug simply matches nothing.
 * - `onSale` / `featured`: when true, only sale / featured products. False means no filter.
 * The default `featured` sort puts featured, then best-rated products first; with a search it ranks
 * products whose name contains the whole query above the rest.
 */
export async function listProducts(options: ListProductsOptions = {}): Promise<ProductList> {
  await connection()

  const page = clampInt(options.page, 1, Number.MAX_SAFE_INTEGER, 1)
  const pageSize = clampInt(options.pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE)
  const sort = options.sort ?? "featured"
  const q = options.q?.trim() ?? ""

  const params: unknown[] = []
  const param = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  const where: string[] = []
  if (options.category) where.push(`c.slug = ${param(options.category)}`)
  if (options.onSale) where.push("p.compare_at_cents > p.price_cents")
  if (options.featured) where.push("p.featured")
  for (const term of q.split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_TERMS)) {
    where.push(`p.search_text ILIKE ${param(`%${escapeLike(term)}%`)}`)
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""

  const countParams = [...params]
  let orderBy = ORDER_BY[sort]
  if (q && sort === "featured") orderBy = `(p.name ILIKE ${param(`%${escapeLike(q)}%`)}) DESC, ${orderBy}`

  const [itemsResult, countResult] = await Promise.all([
    query<SummaryRow>(
      `${SUMMARY_SELECT} ${whereSql}
       ORDER BY ${orderBy}, p.slug
       LIMIT ${param(pageSize)} OFFSET ${param((page - 1) * pageSize)}`,
      params,
    ),
    query<{ total: number }>(
      `SELECT count(*)::int AS total FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`,
      countParams,
    ),
  ])

  const total = countResult.rows[0].total
  return {
    items: itemsResult.rows.map(toSummary),
    page,
    pageSize,
    total,
    pageCount: Math.ceil(total / pageSize),
  }
}

type DetailRow = SummaryRow & { category_id: string; description: string; specs: ProductSpec[] }

/** The full product page data, or null when no product has this slug. */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  await connection()

  const { rows } = await query<DetailRow>(
    `SELECT ${SUMMARY_COLUMNS}, p.category_id, p.description, p.specs ${SUMMARY_FROM} WHERE p.slug = $1`,
    [slug],
  )
  const row = rows[0]
  if (!row) return null

  const [images, related] = await Promise.all([
    query<{ storage_key: string; width: number; height: number; alt: string }>(
      "SELECT storage_key, width, height, alt FROM product_images WHERE product_id = $1 ORDER BY position",
      [row.id],
    ),
    query<SummaryRow>(
      `${SUMMARY_SELECT}
       WHERE p.category_id = $1 AND p.id <> $2
       ORDER BY ${ORDER_BY.featured}, p.slug
       LIMIT ${RELATED_LIMIT}`,
      [row.category_id, row.id],
    ),
  ])

  return {
    ...summaryFields(row),
    description: row.description,
    stock: row.stock,
    specs: row.specs,
    images: images.rows.map((image) => toImage(image.storage_key, image.width, image.height, image.alt)),
    related: related.rows.map(toSummary),
  }
}
