import pg from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Runs the reviews module and the reviews seed step against the docker compose Postgres. Each test
// works on its own throwaway category, products, users and orders (inserted with SQL), which are
// removed afterwards; their reviews go with the users. The seed test re-runs the real seed step,
// which only replaces the seeded reviews.
vi.mock("server-only", () => ({}))
// `@/lib/products` (for escapeLike) imports `connection` from next/server.
vi.mock("next/server", () => ({ connection: async () => {} }))

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const reviews = await import("@/lib/reviews")
const { NotFoundError } = await import("@/lib/errors")
const { seedReviews } = await import("../../db/seed/reviews.mjs")

const run = Array.from({ length: 10 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")
let categoryId: string
const userIds: string[] = []
let productCount = 0

const review = (rating: number, title = `Review ${rating}`) => ({ rating, title, body: "A perfectly fine review." })

async function makeProduct() {
  productCount += 1
  const { rows } = await query<{ id: string; slug: string }>(
    `INSERT INTO products (slug, name, brand, category_id, short_description, description, price_cents, stock)
     VALUES ($1, $2, 'Testco', $3, 'Short', 'Long description.', 1000, 10)
     RETURNING id, slug`,
    [`reviews-${run}-${productCount}`, `Review product ${productCount} ${run}`, categoryId],
  )
  return rows[0]
}

async function makeUser() {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO users (first_name, last_name, email, password_hash)
     VALUES ('Ada', 'Lovelace', $1, 'not-a-real-hash') RETURNING id`,
    [`reviews-${run}-${userIds.length}@example.com`],
  )
  userIds.push(rows[0].id)
  return rows[0].id
}

/** An order of the user's in this status, containing these products. */
async function makeOrder(userId: string, status: string, productIds: string[]) {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO orders (user_id, status, full_name, line1, city, postal_code, country, phone,
                         shipping_method_id, shipping_method_name, shipping_method_price_cents,
                         payment_method_id, payment_method_name, subtotal_cents, shipping_cents, total_cents)
     VALUES ($1, $2, 'Ada Lovelace', '1 Row', 'London', 'EC1', 'GB', '+44 20 0000 0000',
             'standard', 'Standard', 0, 'cards', 'Cards', 1000, 0, 1000)
     RETURNING id`,
    [userId, status],
  )
  for (const [position, productId] of productIds.entries()) {
    await query(
      `INSERT INTO order_items (order_id, product_id, position, product_name, product_slug, brand,
                                unit_price_cents, quantity, line_total_cents)
       VALUES ($1, $2, $3, 'Product', 'product', 'Testco', 1000, 1, 1000)`,
      [rows[0].id, productId, position],
    )
  }
}

/** A user with a delivered order of the product. */
async function customerWhoReceived(productId: string) {
  const userId = await makeUser()
  await makeOrder(userId, "delivered", [productId])
  return userId
}

async function aggregates(productId: string) {
  const { rows } = await query<{ rating: number; review_count: number }>(
    "SELECT rating::float8 AS rating, review_count FROM products WHERE id = $1",
    [productId],
  )
  return { rating: rows[0].rating, reviewCount: rows[0].review_count }
}

beforeAll(async () => {
  const { rows } = await query<{ id: string }>(
    "INSERT INTO categories (slug, name, icon, position) VALUES ($1, $2, 'box', 999) RETURNING id",
    [`reviews-${run}`, `Reviews test ${run}`],
  )
  categoryId = rows[0].id
})

afterAll(async () => {
  await query("DELETE FROM orders WHERE user_id = ANY($1::uuid[])", [userIds])
  // Reviews go with their users.
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds])
  await query("DELETE FROM products WHERE category_id = $1", [categoryId])
  await query("DELETE FROM categories WHERE id = $1", [categoryId])
  await getPool().end()
})

describe("eligibility", () => {
  it("lets a customer with a delivered order review the product, as a verified purchase", async () => {
    const product = await makeProduct()
    const userId = await customerWhoReceived(product.id)

    expect(await reviews.canReview(userId, product.id)).toBe(true)
    const saved = await reviews.saveReview(userId, product.id, review(4, "Nice"))

    expect(saved.created).toBe(true)
    const own = await reviews.getUserReview(userId, product.id)
    expect(own).toMatchObject({ id: saved.id, rating: 4, title: "Nice", status: "published", verified: true, author: "Ada L." })
    expect(await aggregates(product.id)).toEqual({ rating: 4, reviewCount: 1 })
  })

  it.each(["pending", "processing", "shipped", "cancelled", "rejected"])(
    "refuses a customer whose order is only %s",
    async (status) => {
      const product = await makeProduct()
      const userId = await makeUser()
      await makeOrder(userId, status, [product.id])

      expect(await reviews.canReview(userId, product.id)).toBe(false)
      await expect(reviews.saveReview(userId, product.id, review(5))).rejects.toBeInstanceOf(
        reviews.NotEligibleToReviewError,
      )
      expect(await reviews.getUserReview(userId, product.id)).toBeNull()
      expect(await aggregates(product.id)).toEqual({ rating: 0, reviewCount: 0 })
    },
  )

  it("refuses a user whose delivered order is for a different product", async () => {
    const [bought, other] = [await makeProduct(), await makeProduct()]
    const userId = await customerWhoReceived(bought.id)

    expect(await reviews.canReview(userId, other.id)).toBe(false)
    await expect(reviews.saveReview(userId, other.id, review(5))).rejects.toThrow(
      "Only customers who received this product can review it.",
    )
  })

  it("refuses a user when only someone else received the product", async () => {
    const product = await makeProduct()
    await customerWhoReceived(product.id)
    const stranger = await makeUser()

    expect(await reviews.canReview(stranger, product.id)).toBe(false)
    await expect(reviews.saveReview(stranger, product.id, review(1))).rejects.toBeInstanceOf(
      reviews.NotEligibleToReviewError,
    )
    expect(await aggregates(product.id)).toEqual({ rating: 0, reviewCount: 0 })
  })

  it("reports a product that doesn't exist", async () => {
    const userId = await makeUser()
    await expect(
      reviews.saveReview(userId, "00000000-0000-4000-8000-000000000000", review(5)),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("one review per customer per product", () => {
  it("edits the existing review on a second write and updates the aggregate", async () => {
    const product = await makeProduct()
    const [ada, bob] = [await customerWhoReceived(product.id), await customerWhoReceived(product.id)]
    const first = await reviews.saveReview(ada, product.id, review(5, "Love it"))
    await reviews.saveReview(bob, product.id, review(4))
    expect(await aggregates(product.id)).toEqual({ rating: 4.5, reviewCount: 2 })

    const second = await reviews.saveReview(ada, product.id, review(2, "Changed my mind"))

    expect(second).toEqual({ id: first.id, created: false })
    const { rows } = await query("SELECT title, rating FROM reviews WHERE product_id = $1 AND user_id = $2", [
      product.id,
      ada,
    ])
    expect(rows).toEqual([{ title: "Changed my mind", rating: 2 }])
    expect(await aggregates(product.id)).toEqual({ rating: 3, reviewCount: 2 })
  })

  it("rejects a duplicate row at the database level", async () => {
    const product = await makeProduct()
    const userId = await customerWhoReceived(product.id)
    await reviews.saveReview(userId, product.id, review(3))

    await expect(
      query("INSERT INTO reviews (product_id, user_id, rating, title, body) VALUES ($1, $2, 5, 't', 'b')", [
        product.id,
        userId,
      ]),
    ).rejects.toMatchObject({ code: "23505" })
  })

  it("lets the author delete their review, and only once", async () => {
    const product = await makeProduct()
    const userId = await customerWhoReceived(product.id)
    await reviews.saveReview(userId, product.id, review(5))

    await reviews.deleteOwnReview(userId, product.id)

    expect(await aggregates(product.id)).toEqual({ rating: 0, reviewCount: 0 })
    await expect(reviews.deleteOwnReview(userId, product.id)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("moderation keeps the aggregates exact", () => {
  it("hide, unhide and delete recompute rating and count from published reviews", async () => {
    const product = await makeProduct()
    const ids: string[] = []
    for (const rating of [5, 4, 4, 1]) {
      ids.push((await reviews.saveReview(await customerWhoReceived(product.id), product.id, review(rating))).id)
    }
    // (5 + 4 + 4 + 1) / 4 = 3.5
    expect(await aggregates(product.id)).toEqual({ rating: 3.5, reviewCount: 4 })
    expect((await reviews.getReviewSummary(product.id)).distribution.map((d) => d.count)).toEqual([1, 2, 0, 0, 1])

    // Hiding the 1-star: (5 + 4 + 4) / 3 = 4.333… → 4.3
    expect(await reviews.setReviewStatus(ids[3], "hidden")).toMatchObject({ id: ids[3], status: "hidden", productSlug: product.slug })
    expect(await aggregates(product.id)).toEqual({ rating: 4.3, reviewCount: 3 })
    expect((await reviews.listProductReviews(product.id)).total).toBe(3)

    // Hiding a 4-star too: (5 + 4) / 2 = 4.5
    await reviews.setReviewStatus(ids[1], "hidden")
    expect(await aggregates(product.id)).toEqual({ rating: 4.5, reviewCount: 2 })

    await reviews.setReviewStatus(ids[3], "published")
    // (5 + 4 + 1) / 3 = 3.333… → 3.3
    expect(await aggregates(product.id)).toEqual({ rating: 3.3, reviewCount: 3 })

    await reviews.deleteReview(ids[0])
    // (4 + 1) / 2 = 2.5
    expect(await aggregates(product.id)).toEqual({ rating: 2.5, reviewCount: 2 })

    // Deleting a hidden review doesn't change the published numbers.
    await reviews.deleteReview(ids[1])
    expect(await aggregates(product.id)).toEqual({ rating: 2.5, reviewCount: 2 })
  })

  it("drops to zero once every review is hidden", async () => {
    const product = await makeProduct()
    const { id } = await reviews.saveReview(await customerWhoReceived(product.id), product.id, review(5))

    await reviews.setReviewStatus(id, "hidden")

    expect(await aggregates(product.id)).toEqual({ rating: 0, reviewCount: 0 })
    expect(await reviews.getReviewSummary(product.id)).toMatchObject({ average: 0, total: 0 })
  })

  it("recomputes when a reviewer's account is deleted", async () => {
    const product = await makeProduct()
    const keep = await customerWhoReceived(product.id)
    await reviews.saveReview(keep, product.id, review(4))
    const leaving = await makeUser()
    await query(
      "INSERT INTO reviews (product_id, user_id, rating, title, body) VALUES ($1, $2, 1, 'Bad', 'Not good at all.')",
      [product.id, leaving],
    )
    expect(await aggregates(product.id)).toEqual({ rating: 2.5, reviewCount: 2 })

    await query("DELETE FROM users WHERE id = $1", [leaving])

    expect(await aggregates(product.id)).toEqual({ rating: 4, reviewCount: 1 })
  })

  it("reports a review that no longer exists", async () => {
    const missing = "00000000-0000-4000-8000-000000000000"
    await expect(reviews.setReviewStatus(missing, "hidden")).rejects.toBeInstanceOf(NotFoundError)
    await expect(reviews.deleteReview(missing)).rejects.toBeInstanceOf(NotFoundError)
  })

  it("filters the admin list by status, rating and search", async () => {
    const product = await makeProduct()
    const a = await reviews.saveReview(await customerWhoReceived(product.id), product.id, review(5, `Shiny mod${run}`))
    const b = await reviews.saveReview(await customerWhoReceived(product.id), product.id, review(2, `Dull mod${run}`))
    await reviews.setReviewStatus(b.id, "hidden")

    const all = await reviews.listAdminReviews({ q: `mod${run}` })
    expect(all.items.map((r) => r.id).sort()).toEqual([a.id, b.id].sort())
    expect((await reviews.listAdminReviews({ q: `mod${run}`, status: "hidden" })).items.map((r) => r.id)).toEqual([b.id])
    expect((await reviews.listAdminReviews({ q: `mod${run}`, rating: 5 })).items.map((r) => r.id)).toEqual([a.id])
    expect((await reviews.listAdminReviews({ q: `Dull mod${run}` })).total).toBe(1)
  })
})

describe("seeded reviews", () => {
  it("are replaced identically on every run, leaving real reviews and their aggregates alone", async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      const { rows: target } = await client.query<{ id: string }>(
        "SELECT id FROM products WHERE slug = 'halden-aria-anc-wireless-headphones'",
      )
      if (!target[0]) throw new Error("run `npm run db:seed` before the integration tests")
      const productId = target[0].id
      const realUser = await customerWhoReceived(productId)
      await reviews.saveReview(realUser, productId, review(1, `Real ${run}`))

      const snapshot = async () =>
        (
          await client.query(
            `SELECT p.slug, u.email, r.rating, r.title, r.status, r.verified, r.seeded
             FROM reviews r JOIN products p ON p.id = r.product_id JOIN users u ON u.id = r.user_id
             WHERE r.seeded OR r.user_id = $1
             ORDER BY p.slug, u.email`,
            [realUser],
          )
        ).rows
      const products = async () =>
        (await client.query("SELECT slug, rating::float8 AS rating, review_count FROM products ORDER BY slug")).rows

      await seedReviews(client)
      const first = await snapshot()
      const firstProducts = await products()
      await seedReviews(client)

      expect(await snapshot()).toEqual(first)
      expect(await products()).toEqual(firstProducts)
      expect(first.filter((r) => r.seeded).length).toBeGreaterThan(50)
      expect(first.filter((r) => r.seeded && r.verified).map((r) => r.email)).toEqual(
        expect.arrayContaining(["anna@northcart.test", "ben@northcart.test", "chloe@northcart.test"]),
      )
      expect(first.filter((r) => r.email.endsWith("@reviewers.northcart.test")).every((r) => !r.verified)).toBe(true)
      expect(first.filter((r) => !r.seeded)).toEqual([
        expect.objectContaining({ title: `Real ${run}`, rating: 1, verified: true }),
      ])

      // Aggregates match the published reviews, the real one included.
      const { rows: mismatched } = await client.query(
        `SELECT p.slug FROM products p
         LEFT JOIN (SELECT product_id, round(avg(rating)::numeric, 1) AS average, count(*)::int AS total
                    FROM reviews WHERE status = 'published' GROUP BY product_id) s ON s.product_id = p.id
         WHERE (p.rating, p.review_count) IS DISTINCT FROM (COALESCE(s.average, 0), COALESCE(s.total, 0))`,
      )
      expect(mismatched).toEqual([])
      const { rows: counts } = await client.query(
        "SELECT max(review_count) AS max FROM products WHERE category_id <> $1",
        [categoryId],
      )
      expect(counts[0].max).toBeLessThanOrEqual(9)
    } finally {
      await client.end()
    }
  })
})
