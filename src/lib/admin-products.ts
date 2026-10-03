import "server-only"

import { connection } from "next/server"
import type { PoolClient } from "pg"

import { query, withTransaction } from "@/lib/db"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors"
import type { Page } from "@/lib/orders"
import { escapeLike, type ProductSpec } from "@/lib/products"
import { mediaUrl } from "@/lib/storage"
import {
  DEFAULT_ADMIN_PRODUCTS_PAGE_SIZE,
  LOW_STOCK_THRESHOLD,
  MAX_ADMIN_PRODUCTS_PAGE_SIZE,
  type AdminProductListQuery,
  type ProductInput,
} from "@/lib/validation/admin-products"

/**
 * Product management for the admin area: list, read, create, update and delete. Callers check the
 * admin role; the input is expected to come from `ProductFormSchema`. Images point at objects that
 * `uploadImage` already stored; deleting a product or an image never deletes the object, because
 * order history (`order_items.image_key`) and other products may still use the same key.
 */

const UNIQUE_VIOLATION = "23505"
const FOREIGN_KEY_VIOLATION = "23503"

/** The slug is already used by another product. Reported on the form's slug field. */
export class SlugTakenError extends ConflictError {
  readonly field = "slug"
  constructor() {
    super("Another product already uses this slug.")
  }
}

export type AdminProductSummary = {
  id: string
  slug: string
  name: string
  brand: string
  category: { slug: string; name: string }
  priceCents: number
  compareAtCents: number | null
  currency: string
  stock: number
  featured: boolean
  badge: string | null
  // The primary image (position 0), or null.
  image: { url: string; alt: string } | null
}

export type AdminProductImage = {
  key: string
  url: string
  width: number
  height: number
  alt: string
}

export type AdminProduct = Omit<AdminProductSummary, "category" | "image"> & {
  categoryId: string
  shortDescription: string
  description: string
  rating: number
  reviewCount: number
  specs: ProductSpec[]
  // Ordered by position; the first one is the primary image.
  images: AdminProductImage[]
  // How many order lines point at this product (they keep their snapshot if it's deleted).
  orderLineCount: number
}

export type AdminProductListOptions = Partial<AdminProductListQuery>

type SummaryRow = {
  id: string
  slug: string
  name: string
  brand: string
  category_slug: string
  category_name: string
  price_cents: number
  compare_at_cents: number | null
  currency: string
  stock: number
  featured: boolean
  badge: string | null
  image_key: string | null
  image_alt: string | null
}

const SUMMARY_SELECT = `
  SELECT p.id, p.slug, p.name, p.brand, c.slug AS category_slug, c.name AS category_name,
         p.price_cents, p.compare_at_cents, p.currency, p.stock, p.featured, p.badge,
         img.storage_key AS image_key, img.alt AS image_alt
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT storage_key, alt FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1
  ) img ON true`

function toSummary(row: SummaryRow): AdminProductSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: { slug: row.category_slug, name: row.category_name },
    priceCents: row.price_cents,
    compareAtCents: row.compare_at_cents,
    currency: row.currency,
    stock: row.stock,
    featured: row.featured,
    badge: row.badge,
    image: row.image_key === null ? null : { url: mediaUrl(row.image_key), alt: row.image_alt ?? row.name },
  }
}

const clampInt = (value: number | undefined, min: number, max: number, fallback: number) =>
  value === undefined || !Number.isFinite(value) ? fallback : Math.min(max, Math.max(min, Math.floor(value)))

/**
 * One page of products for the admin list, newest first. Filters combine with AND: `q` matches
 * part of the name, brand or slug (case-insensitive); `category` is a category slug; `stock: "low"`
 * keeps products at or below LOW_STOCK_THRESHOLD and sorts them lowest stock first.
 */
export async function listAdminProducts(options: AdminProductListOptions = {}): Promise<Page<AdminProductSummary>> {
  await connection()

  const page = clampInt(options.page, 1, Number.MAX_SAFE_INTEGER, 1)
  const pageSize = clampInt(options.pageSize, 1, MAX_ADMIN_PRODUCTS_PAGE_SIZE, DEFAULT_ADMIN_PRODUCTS_PAGE_SIZE)
  const q = options.q?.trim() ?? ""

  const params: unknown[] = []
  const param = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  const where: string[] = []
  if (q) {
    const pattern = param(`%${escapeLike(q)}%`)
    where.push(`(p.name ILIKE ${pattern} OR p.brand ILIKE ${pattern} OR p.slug ILIKE ${pattern})`)
  }
  if (options.category) where.push(`c.slug = ${param(options.category)}`)
  if (options.stock === "low") where.push(`p.stock <= ${param(LOW_STOCK_THRESHOLD)}`)
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""
  const countParams = [...params]
  const orderBy = options.stock === "low" ? "p.stock ASC, p.name ASC" : "p.created_at DESC"

  const [items, count] = await Promise.all([
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

  const total = count.rows[0].total
  return { items: items.rows.map(toSummary), page, pageSize, total, pageCount: Math.ceil(total / pageSize) }
}

/** The `limit` products with the least stock at or below LOW_STOCK_THRESHOLD, lowest first. */
export async function listLowStockProducts(limit: number): Promise<AdminProductSummary[]> {
  await connection()
  const { rows } = await query<SummaryRow>(
    `${SUMMARY_SELECT} WHERE p.stock <= $1 ORDER BY p.stock ASC, p.name ASC, p.slug LIMIT $2`,
    [LOW_STOCK_THRESHOLD, limit],
  )
  return rows.map(toSummary)
}

type ProductRow = {
  id: string
  slug: string
  name: string
  brand: string
  category_id: string
  short_description: string
  description: string
  price_cents: number
  compare_at_cents: number | null
  currency: string
  stock: number
  rating: number
  review_count: number
  badge: string | null
  featured: boolean
  specs: ProductSpec[]
  order_line_count: number
}

/** A product with everything the edit form needs, or null when there's no product with this id. */
export async function getAdminProduct(id: string): Promise<AdminProduct | null> {
  await connection()
  const { rows } = await query<ProductRow>(
    `SELECT p.id, p.slug, p.name, p.brand, p.category_id, p.short_description, p.description,
            p.price_cents, p.compare_at_cents, p.currency, p.stock, p.rating::float8 AS rating,
            p.review_count, p.badge, p.featured, p.specs,
            (SELECT count(*)::int FROM order_items WHERE product_id = p.id) AS order_line_count
     FROM products p WHERE p.id = $1`,
    [id],
  )
  const row = rows[0]
  if (!row) return null

  const images = await query<{ storage_key: string; width: number; height: number; alt: string }>(
    "SELECT storage_key, width, height, alt FROM product_images WHERE product_id = $1 ORDER BY position",
    [id],
  )

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    categoryId: row.category_id,
    shortDescription: row.short_description,
    description: row.description,
    priceCents: row.price_cents,
    compareAtCents: row.compare_at_cents,
    currency: row.currency,
    stock: row.stock,
    rating: row.rating,
    reviewCount: row.review_count,
    badge: row.badge,
    featured: row.featured,
    specs: row.specs,
    images: images.rows.map((image) => ({
      key: image.storage_key,
      url: mediaUrl(image.storage_key),
      width: image.width,
      height: image.height,
      alt: image.alt,
    })),
    orderLineCount: row.order_line_count,
  }
}

// The schema already checks this; the domain repeats it so no caller can hit the DB constraint.
function assertCompareAt(input: ProductInput) {
  if (input.compareAt !== null && input.compareAt <= input.price) {
    throw new ValidationError({ compareAt: ["Compare-at price must be higher than the price, or empty."] })
  }
}

function translateDbError(err: unknown): never {
  const { code, constraint } = err as { code?: string; constraint?: string }
  if (code === UNIQUE_VIOLATION && constraint === "products_slug_key") throw new SlugTakenError()
  if (code === FOREIGN_KEY_VIOLATION && constraint === "products_category_id_fkey") {
    throw new ValidationError({ categoryId: ["This category no longer exists."] })
  }
  throw err
}

// Positions follow the array order, so the first image becomes the primary one.
async function replaceImages(client: PoolClient, productId: string, images: ProductInput["images"]) {
  await client.query("DELETE FROM product_images WHERE product_id = $1", [productId])
  if (images.length === 0) return
  await client.query(
    `INSERT INTO product_images (product_id, storage_key, width, height, alt, position)
     SELECT $1, t.key, t.width, t.height, t.alt, t.ord - 1
     FROM unnest($2::text[], $3::int[], $4::int[], $5::text[]) WITH ORDINALITY AS t(key, width, height, alt, ord)`,
    [
      productId,
      images.map((image) => image.key),
      images.map((image) => image.width),
      images.map((image) => image.height),
      images.map((image) => image.alt),
    ],
  )
}

const productParams = (input: ProductInput) => [
  input.slug,
  input.name,
  input.brand,
  input.categoryId,
  input.shortDescription,
  input.description,
  input.price,
  input.compareAt,
  input.stock,
  input.badge,
  input.featured,
  JSON.stringify(input.specs),
]

/** Creates a product with its images. Throws SlugTakenError when the slug is in use. */
export async function createProduct(input: ProductInput): Promise<{ id: string; slug: string }> {
  assertCompareAt(input)
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; slug: string }>(
        `INSERT INTO products (slug, name, brand, category_id, short_description, description,
                               price_cents, compare_at_cents, stock, badge, featured, specs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
         RETURNING id, slug`,
        productParams(input),
      )
      await replaceImages(client, rows[0].id, input.images)
      return rows[0]
    })
  } catch (err) {
    translateDbError(err)
  }
}

/**
 * Overwrites a product and replaces its images with `input.images`, in that order, in one
 * transaction. Rating and review count are left alone. Throws NotFoundError for an unknown id and
 * SlugTakenError when another product has the slug.
 */
export async function updateProduct(id: string, input: ProductInput): Promise<{ id: string; slug: string }> {
  assertCompareAt(input)
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; slug: string }>(
        `UPDATE products SET slug = $1, name = $2, brand = $3, category_id = $4, short_description = $5,
                description = $6, price_cents = $7, compare_at_cents = $8, stock = $9, badge = $10,
                featured = $11, specs = $12::jsonb
         WHERE id = $13
         RETURNING id, slug`,
        [...productParams(input), id],
      )
      if (!rows[0]) throw new NotFoundError("This product no longer exists.")
      await replaceImages(client, id, input.images)
      return rows[0]
    })
  } catch (err) {
    translateDbError(err)
  }
}

/**
 * Deletes a product. Its images and cart lines go with it (ON DELETE CASCADE); order lines keep
 * their snapshot with `product_id` set to NULL. Throws NotFoundError for an unknown id.
 */
export async function deleteProduct(id: string): Promise<{ id: string; slug: string; name: string }> {
  const { rows } = await query<{ id: string; slug: string; name: string }>(
    "DELETE FROM products WHERE id = $1 RETURNING id, slug, name",
    [id],
  )
  if (!rows[0]) throw new NotFoundError("This product no longer exists.")
  return rows[0]
}
