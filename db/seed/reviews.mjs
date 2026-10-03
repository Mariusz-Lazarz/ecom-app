import { randomBytes } from "node:crypto"

import bcrypt from "bcryptjs"

import { ADMIN } from "./admin.mjs"
import { CUSTOMERS } from "./customer.mjs"
import { products } from "./products-data.mjs"

// Same cost as src/lib/users.ts.
const BCRYPT_ROUNDS = 12
const DAY = 24 * 60 * 60 * 1000
const MAX_REVIEWS_PER_PRODUCT = 8

/**
 * Accounts that exist only to give the demo catalogue some reviews. Nobody can sign in as them
 * (their password is random and never stored) and they have no orders, so their reviews are
 * `verified = false`. The domain is reserved for them.
 */
export const REVIEWER_DOMAIN = "reviewers.northcart.test"
export const REVIEWERS = [
  ["maya", "Maya", "Patel"],
  ["lucas", "Lucas", "Moreau"],
  ["sofia", "Sofia", "Rossi"],
  ["jonas", "Jonas", "Weber"],
  ["priya", "Priya", "Nair"],
  ["tom", "Tom", "Hughes"],
  ["elena", "Elena", "García"],
  ["kenji", "Kenji", "Sato"],
  ["olivia", "Olivia", "Brooks"],
  ["mateo", "Mateo", "Silva"],
].map(([key, firstName, lastName]) => ({ email: `${key}@${REVIEWER_DOMAIN}`, firstName, lastName }))

/**
 * Reviews by the test customers and the admin, each on a product they have a delivered sample
 * order for (see orders.mjs), so they are verified purchases. Some delivered products are left
 * unreviewed on purpose, so "Write a review" can be tried out.
 */
const CUSTOMER_REVIEWS = [
  {
    email: "anna@northcart.test",
    product: "halden-aria-anc-wireless-headphones",
    rating: 5,
    daysAgo: 50,
    title: "The quietest commute I've ever had",
    body: "I take a packed tram every morning and these make it disappear. The noise cancelling is strong without that pressure feeling, battery easily lasts my whole week, and they fold small enough for my work bag.",
  },
  {
    email: "anna@northcart.test",
    product: "harbor-leather-card-holder",
    rating: 4,
    daysAgo: 33,
    title: "Slim and nicely stitched",
    body: "Holds five cards and a folded note without bulging. The leather was a little stiff for the first week but has softened nicely. Would love one more slot.",
  },
  {
    email: "ben@northcart.test",
    product: "strider-velocity-knit-running-shoe",
    rating: 4,
    daysAgo: 45,
    title: "Light and quick, runs a touch narrow",
    body: "Great for tempo runs and anything up to a half marathon. The knit upper breathes well. I have slightly wide feet and they felt snug for the first few runs, so consider half a size up.",
  },
  {
    email: "ben@northcart.test",
    product: "fieldnote-washed-cotton-cap",
    rating: 3,
    daysAgo: 44,
    title: "Nice fabric, shallow fit",
    body: "The washed cotton feels lovely and the colour is spot on, but the crown is shallower than I expected and it sits high on my head. Fine for sunny walks, not my everyday cap.",
  },
  {
    email: "chloe@northcart.test",
    product: "polaris-onestep-instant-camera",
    rating: 4,
    daysAgo: 20,
    title: "So much fun at parties",
    body: "Everyone wanted a turn with it at my sister's birthday. Photos come out with that warm, dreamy look. Indoors you need to stand fairly close for the flash to reach, and film isn't cheap, but I love it.",
  },
  {
    email: ADMIN.email,
    product: "calder-meridian-blue-dial-automatic",
    rating: 5,
    daysAgo: 30,
    title: "That blue dial is something else",
    body: "Sunburst dial changes from navy to bright blue depending on the light. It has gained about four seconds a day, well within spec, and the bracelet is comfortable even in summer.",
  },
]

// Generic enough to fit any product; a category line is added to some of them.
const TEMPLATES = {
  5: [
    ["Exactly what I hoped for", "Arrived quickly, beautifully packed, and the quality is even better than the photos suggest."],
    ["Worth every penny", "I went back and forth for weeks before buying and I'm so glad I did. It feels like it will last for years."],
    ["Love it", "Use it every day and still smile when I pick it up. The details are really well thought out."],
    ["Second one I've bought", "Bought one for myself last year and liked it so much that I got another as a gift. Still going strong."],
    ["Superb quality", "Everything about it feels premium, from the materials to the finish. No complaints at all."],
    ["Better than expected", "I had modest expectations for the price and was genuinely impressed. Highly recommend."],
    ["Perfect gift", "Bought it for my partner's birthday and it was a huge hit. Lovely presentation out of the box."],
    ["Five stars, no hesitation", "Does exactly what it promises and looks great doing it. Delivery was faster than quoted too."],
  ],
  4: [
    ["Really good, small niggles", "Very happy overall. A couple of small things could be better, but nothing that would stop me recommending it."],
    ["Solid choice", "Well made and does the job nicely. Not flashy, just dependable."],
    ["Great value", "Quality is close to products that cost twice as much. Took a few days to get used to it."],
    ["Happy with it", "Looks and feels good. Instructions could be clearer, but it was easy to figure out."],
    ["Nearly perfect", "Only knocking off a star because it's a little heavier than I expected. Otherwise excellent."],
    ["Good buy", "Does what I needed and has held up well so far. Would buy from Northcart again."],
    ["Pleasantly surprised", "The finish is lovely in person. Packaging was a bit excessive, but the product itself is great."],
  ],
  3: [
    ["It's fine", "Does the job, but nothing special. I expected a little more at this price."],
    ["Mixed feelings", "Some things I really like, others I don't. Worth a look if it's on sale."],
    ["Average", "Not bad, not great. The quality is okay, but I've seen better finishing."],
    ["Okay for the price", "Decent for everyday use. I wouldn't call it premium though."],
  ],
  2: [
    ["Disappointed", "Looked great in the photos, but in person it feels cheaper than I'd hoped."],
    ["Not for me", "Quality seems fine, but it just didn't suit how I wanted to use it. Returning it."],
    ["Expected more", "A few rough edges in the finish and it took ages to feel comfortable. Customer service was helpful though."],
  ],
  1: [
    ["Arrived faulty", "Mine didn't work properly out of the box. The replacement was fine, but the first impression stuck."],
    ["Wouldn't recommend", "Fell apart after a couple of weeks of light use. Very disappointing."],
  ],
}

const CATEGORY_NOTES = {
  good: {
    audio: [
      "Sound is clear and well balanced, even at low volume.",
      "Pairing was instant and the connection never drops.",
      "Bass is punchy without drowning out vocals.",
      "Battery life is even better than advertised.",
    ],
    watches: [
      "Keeps excellent time and looks great on the wrist.",
      "The clasp is secure and the strap is comfortable all day.",
      "The dial is easy to read, even in low light.",
      "Gets compliments every time I wear it.",
    ],
    footwear: [
      "True to size and comfortable from the first wear.",
      "Plenty of grip and my feet don't ache after a long day.",
      "No break-in period needed at all.",
      "They still look new after months of wear.",
    ],
    cameras: [
      "Image quality is excellent and the controls are easy to learn.",
      "Autofocus is quick and the battery lasts a full day out.",
      "Colours straight out of the camera look fantastic.",
      "Light enough to take everywhere.",
    ],
    accessories: [
      "Feels well made and has held up to daily use.",
      "Goes with almost everything I own.",
      "The finish is even nicer in person.",
      "Small details like the stitching are spot on.",
    ],
    bags: [
      "Plenty of room and the straps stay comfortable all day.",
      "The pockets are well placed and the zips feel sturdy.",
      "Survived a downpour with everything inside bone dry.",
      "Fits my laptop with room to spare.",
    ],
  },
  bad: {
    audio: ["The sound is a bit flat compared to what I expected."],
    watches: ["The strap irritated my wrist after a few hours."],
    footwear: ["Sizing runs small, so they pinch around the toes."],
    cameras: ["The menus are confusing and the battery drains fast."],
    accessories: ["The finish started wearing off sooner than I'd like."],
    bags: ["One of the seams came loose after a few weeks."],
  },
}

// Seeded reviews the moderators already hid, so the admin list has something to unhide.
const SPAM = [
  ["Huge discounts here!!!", "Get this and more for 90% off at my shop, link in my profile."],
  ["first", "first review lol"],
]

/** A small deterministic PRNG (mulberry32) seeded from a string, so re-runs produce the same reviews. */
export function randomFor(key) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  let state = h >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (random, list) => list[Math.floor(random() * list.length)]

function shuffle(random, list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// How many reviewer reviews a product gets: 0–8, most often 3–5.
const COUNT_WEIGHTS = [1, 2, 3, 4, 4, 4, 3, 2, 1]
function reviewCount(random) {
  let roll = random() * COUNT_WEIGHTS.reduce((a, b) => a + b, 0)
  for (const [count, weight] of COUNT_WEIGHTS.entries()) {
    roll -= weight
    if (roll < 0) return count
  }
  return COUNT_WEIGHTS.length - 1
}

/**
 * The reviewer reviews for every catalogue product: a count (fewer for brand-new products), each
 * by a different reviewer, with ratings around a per-product "quality" so most products land
 * between 3.5 and 4.8. `taken` is how many customer reviews the product already has.
 */
export function planReviewerReviews(taken = new Map()) {
  const planned = []
  for (const product of products) {
    const random = randomFor(product.slug)
    const quality = 3.6 + random() * 1.3
    const room = MAX_REVIEWS_PER_PRODUCT - (taken.get(product.slug) ?? 0)
    const count = Math.min(reviewCount(random), room, Math.floor(product.daysAgo / 4))
    const reviewers = shuffle(random, REVIEWERS).slice(0, count)
    const usedTitles = new Set()
    const usedNotes = new Set()

    for (const reviewer of reviewers) {
      const spread = (random() + random() + random() - 1.5) * 1.4
      const rating = Math.min(5, Math.max(1, Math.round(quality + spread)))
      const spam = random() < 0.01
      let title, body
      if (spam) {
        ;[title, body] = pick(random, SPAM)
      } else {
        const options = TEMPLATES[rating].filter(([t]) => !usedTitles.has(t))
        ;[title, body] = pick(random, options.length ? options : TEMPLATES[rating])
        const notes = CATEGORY_NOTES[rating >= 4 ? "good" : "bad"][product.category].filter((n) => !usedNotes.has(n))
        if (notes.length && random() < 0.6) {
          const note = pick(random, notes)
          usedNotes.add(note)
          body = `${note} ${body}`
        }
      }
      usedTitles.add(title)
      planned.push({
        email: reviewer.email,
        product: product.slug,
        rating,
        title,
        body,
        status: spam ? "hidden" : "published",
        // Never older than the product itself.
        daysAgo: 1 + Math.floor(random() * Math.max(1, product.daysAgo - 1)),
        hour: Math.floor(random() * 24),
      })
    }
  }
  return planned
}

async function upsertReviewers(client) {
  const emails = REVIEWERS.map((r) => r.email)
  const { rows } = await client.query("SELECT lower(email) AS email FROM users WHERE lower(email) = ANY($1)", [emails])
  const existing = new Set(rows.map((row) => row.email))
  for (const reviewer of REVIEWERS) {
    // A random password nobody knows: these accounts can't sign in. An existing account keeps its hash.
    const passwordHash = existing.has(reviewer.email)
      ? null
      : await bcrypt.hash(randomBytes(24).toString("base64url"), BCRYPT_ROUNDS)
    await client.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'user')
       ON CONFLICT (lower(email)) DO UPDATE
         SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, role = 'user'`,
      [reviewer.firstName, reviewer.lastName, reviewer.email, passwordHash ?? "unused"],
    )
  }
}

async function insertReview(client, review, { verified, now }) {
  const createdAt = new Date(now - review.daysAgo * DAY - (review.hour ?? 10) * (DAY / 24))
  const { rowCount } = await client.query(
    `INSERT INTO reviews (product_id, user_id, rating, title, body, status, verified, seeded, created_at, updated_at)
     SELECT p.id, u.id, $3, $4, $5, $6, $7, true, $8, $8
     FROM products p, users u
     WHERE p.slug = $1 AND lower(u.email) = $2
     -- A real review by the same person stays as it is.
     ON CONFLICT (product_id, user_id) DO NOTHING`,
    [review.product, review.email.toLowerCase(), review.rating, review.title, review.body, review.status ?? "published", verified, createdAt],
  )
  return rowCount
}

/**
 * Replaces the seeded reviews (`seeded = true`): the hand-written ones by the test customers and
 * the admin (verified purchases, checked against their delivered orders) and the generated ones by
 * the REVIEWERS accounts (not verified). Real reviews are never touched. Then recomputes every
 * product's rating and review count. Needs the products and orders steps to have run.
 */
export async function seedReviews(client) {
  const owners = new Set([...CUSTOMERS.map((c) => c.email), ADMIN.email])
  for (const review of CUSTOMER_REVIEWS) {
    if (!owners.has(review.email)) throw new Error(`customer review by unknown account ${review.email}`)
  }
  const taken = new Map()
  for (const review of CUSTOMER_REVIEWS) taken.set(review.product, (taken.get(review.product) ?? 0) + 1)
  const planned = planReviewerReviews(taken)
  const now = Date.now()

  await client.query("BEGIN")
  try {
    await upsertReviewers(client)
    await client.query("DELETE FROM reviews WHERE seeded")

    let inserted = 0
    for (const review of CUSTOMER_REVIEWS) {
      const { rows } = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
           JOIN users u ON u.id = o.user_id JOIN products p ON p.id = oi.product_id
           WHERE lower(u.email) = $1 AND p.slug = $2 AND o.status = 'delivered'
         ) AS delivered`,
        [review.email.toLowerCase(), review.product],
      )
      if (!rows[0].delivered) {
        throw new Error(`${review.email} has no delivered order for "${review.product}" to review (run the orders step)`)
      }
      inserted += await insertReview(client, review, { verified: true, now })
    }
    for (const review of planned) inserted += await insertReview(client, review, { verified: false, now })

    await client.query("SELECT refresh_product_rating(id) FROM products")
    await client.query("COMMIT")
    const hidden = planned.filter((r) => r.status === "hidden").length
    return `${inserted} reviews (${CUSTOMER_REVIEWS.length} verified, ${hidden} hidden) incl. ${REVIEWERS.length} reviewer accounts`
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  }
}
