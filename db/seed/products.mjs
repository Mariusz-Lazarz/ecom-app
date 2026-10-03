import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

// The real upload pipeline (sharp → WebP, content-hashed key, immutable cache headers). The seed runs
// under tsx with the react-server condition (see `db:seed` in package.json), so it can import the
// TypeScript, server-only module as is.
import { getS3Client, uploadImage } from "../../src/lib/storage.ts"
import { products } from "./products-data.mjs"

const MEDIA_FOLDER = "products"
// Originals are cached here, so re-running the seed doesn't download ~150 photos again.
const CACHE_DIR = path.join(import.meta.dirname, "..", "..", ".cache", "seed-images")
const DOWNLOAD_CONCURRENCY = 6

export const unsplashUrl = (id) => `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`

async function download(product, id) {
  const file = path.join(CACHE_DIR, `${id}.img`)
  try {
    return await readFile(file)
  } catch {
    // Not cached yet.
  }

  const url = unsplashUrl(id)
  const fail = (reason) => new Error(`image for "${product.slug}" (${url}): ${reason}`)
  let res
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  } catch (err) {
    throw fail(err.message)
  }
  if (!res.ok) throw fail(`HTTP ${res.status}`)
  const type = res.headers.get("content-type") ?? ""
  if (!type.startsWith("image/")) throw fail(`expected an image, got "${type}"`)

  const bytes = Buffer.from(await res.arrayBuffer())
  await writeFile(file, bytes)
  return bytes
}

async function storeImages(product) {
  const stored = []
  for (const [id, alt] of product.images) {
    const bytes = await download(product, id)
    let image
    try {
      image = await uploadImage(bytes, MEDIA_FOLDER)
    } catch (err) {
      throw new Error(`image for "${product.slug}" (${unsplashUrl(id)}): ${err.message}`, { cause: err })
    }
    stored.push({ key: image.key, width: image.width, height: image.height, alt })
  }
  return stored
}

// Runs `fn` over `items` with at most `limit` calls in flight, keeping the results in order. Stops
// starting new calls after the first failure.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  let failed = false
  const worker = async () => {
    while (next < items.length && !failed) {
      const i = next++
      try {
        results[i] = await fn(items[i])
      } catch (err) {
        failed = true
        throw err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// rating and review_count are left alone: they are derived from the product's reviews (see the
// reviews step and db/migrations/007_create_reviews.sql).
async function upsertProduct(client, product, categoryId, images) {
  const { rows } = await client.query(
    `INSERT INTO products (slug, name, brand, category_id, short_description, description, price_cents,
                           compare_at_cents, stock, badge, featured, specs, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now() - make_interval(days => $13))
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name, brand = EXCLUDED.brand, category_id = EXCLUDED.category_id,
       short_description = EXCLUDED.short_description, description = EXCLUDED.description,
       price_cents = EXCLUDED.price_cents, compare_at_cents = EXCLUDED.compare_at_cents,
       stock = EXCLUDED.stock, badge = EXCLUDED.badge, featured = EXCLUDED.featured, specs = EXCLUDED.specs,
       created_at = EXCLUDED.created_at
     RETURNING id`,
    [
      product.slug,
      product.name,
      product.brand,
      categoryId,
      product.shortDescription,
      product.description,
      product.price,
      product.compareAt,
      product.stock,
      product.badge,
      product.featured,
      JSON.stringify(product.specs.map(([label, value]) => ({ label, value }))),
      product.daysAgo,
    ],
  )
  const productId = rows[0].id

  await client.query("DELETE FROM product_images WHERE product_id = $1", [productId])
  for (const [position, image] of images.entries()) {
    await client.query(
      `INSERT INTO product_images (product_id, storage_key, width, height, alt, position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [productId, image.key, image.width, image.height, image.alt, position],
    )
  }
}

/**
 * Upserts the demo catalogue (by slug) and replaces each product's image rows. Every image is
 * downloaded and uploaded before the database is touched, so a failed download aborts the step
 * without seeding a product with missing photos. Uploading the same bytes again yields the same key.
 */
export async function seedProducts(client) {
  const { rows: categories } = await client.query("SELECT id, slug FROM categories")
  const categoryIds = new Map(categories.map((c) => [c.slug, c.id]))
  for (const product of products) {
    if (!categoryIds.has(product.category)) {
      throw new Error(`product "${product.slug}" has unknown category "${product.category}". Run npm run db:migrate.`)
    }
  }

  await mkdir(CACHE_DIR, { recursive: true })
  let images
  try {
    images = await mapLimit(products, DOWNLOAD_CONCURRENCY, storeImages)
  } finally {
    getS3Client().destroy()
  }

  await client.query("BEGIN")
  try {
    for (const [i, product] of products.entries()) {
      await upsertProduct(client, product, categoryIds.get(product.category), images[i])
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  }

  const imageCount = images.reduce((sum, list) => sum + list.length, 0)
  return `${products.length} products, ${imageCount} images`
}
