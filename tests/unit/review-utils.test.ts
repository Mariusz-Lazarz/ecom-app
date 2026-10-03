import { describe, expect, it } from "vitest"

import {
  adminReviewsHref,
  emptyRatingCounts,
  parseAdminReviewQuery,
  parseProductReviewQuery,
  productReviewsHref,
  reviewerName,
  reviewFormHref,
  summarizeRatings,
} from "@/lib/review-utils"

describe("summarizeRatings", () => {
  it("is all zeros without reviews", () => {
    expect(summarizeRatings(emptyRatingCounts())).toEqual({
      average: 0,
      total: 0,
      distribution: [
        { stars: 5, count: 0, percent: 0 },
        { stars: 4, count: 0, percent: 0 },
        { stars: 3, count: 0, percent: 0 },
        { stars: 2, count: 0, percent: 0 },
        { stars: 1, count: 0, percent: 0 },
      ],
    })
  })

  it("lists 5 stars first with each rating's count and whole-percent share", () => {
    const summary = summarizeRatings({ 5: 2, 4: 1, 3: 0, 2: 0, 1: 1 })

    expect(summary.total).toBe(4)
    // (10 + 4 + 1) / 4 = 3.75 → 3.8
    expect(summary.average).toBe(3.8)
    expect(summary.distribution).toEqual([
      { stars: 5, count: 2, percent: 50 },
      { stars: 4, count: 1, percent: 25 },
      { stars: 3, count: 0, percent: 0 },
      { stars: 2, count: 0, percent: 0 },
      { stars: 1, count: 1, percent: 25 },
    ])
  })

  it("gives a single review its exact rating and 100%", () => {
    const summary = summarizeRatings({ ...emptyRatingCounts(), 3: 1 })
    expect(summary).toMatchObject({ average: 3, total: 1 })
    expect(summary.distribution.find((d) => d.stars === 3)).toEqual({ stars: 3, count: 1, percent: 100 })
  })

  it.each([
    // 4.25 rounds half up like Postgres round(numeric, 1).
    [{ 5: 1, 4: 3, 3: 0, 2: 0, 1: 0 }, 4.3],
    // 4.15 exactly, where floating point (4.15 * 10 = 41.49999…) would round down.
    [{ 5: 3, 4: 17, 3: 0, 2: 0, 1: 0 }, 4.2],
    // 13 / 3 = 4.333… → 4.3
    [{ 5: 1, 4: 2, 3: 0, 2: 0, 1: 0 }, 4.3],
    [{ 5: 0, 4: 0, 3: 0, 2: 0, 1: 7 }, 1],
  ])("rounds the average %o to %d", (counts, average) => {
    expect(summarizeRatings(counts).average).toBe(average)
  })

  it("rounds shares to whole percent (they may not add up to exactly 100)", () => {
    const { distribution } = summarizeRatings({ 5: 1, 4: 1, 3: 1, 2: 0, 1: 0 })
    expect(distribution.map((d) => d.percent)).toEqual([33, 33, 33, 0, 0])
  })
})

describe("reviewerName", () => {
  it.each([
    ["Anna", "Kowalska", "Anna K."],
    ["  ben ", " carter", "ben C."],
    ["Elena", "García", "Elena G."],
    ["Cher", "", "Cher"],
  ])("%s %s → %s", (first, last, expected) => {
    expect(reviewerName(first, last)).toBe(expected)
  })
})

describe("product review params", () => {
  it("defaults to the 5 newest", () => {
    expect(parseProductReviewQuery({})).toEqual({ sort: "newest", shown: 5 })
  })

  it("reads the sort and how many are shown", () => {
    expect(parseProductReviewQuery({ reviewSort: "lowest", reviews: "15" })).toEqual({ sort: "lowest", shown: 15 })
  })

  it.each([
    [{ reviewSort: "oldest", reviews: "10" }, { sort: "newest", shown: 10 }],
    [{ reviewSort: "highest", reviews: "0" }, { sort: "highest", shown: 5 }],
    [{ reviews: "201" }, { sort: "newest", shown: 5 }],
    [{ reviews: ["10", "20"] }, { sort: "newest", shown: 10 }],
  ])("drops invalid params %o", (params, expected) => {
    expect(parseProductReviewQuery(params)).toEqual(expected)
  })

  it("builds links to the reviews section, leaving out defaults", () => {
    expect(productReviewsHref("trail-mug")).toBe("/products/trail-mug#reviews")
    expect(productReviewsHref("trail-mug", { sort: "newest", shown: 5 })).toBe("/products/trail-mug#reviews")
    expect(productReviewsHref("trail-mug", { sort: "highest", shown: 10 })).toBe(
      "/products/trail-mug?reviewSort=highest&reviews=10#reviews",
    )
    expect(reviewFormHref("trail-mug")).toBe("/products/trail-mug#write-review")
  })
})

describe("admin review params", () => {
  it("reads the filters and drops invalid ones", () => {
    expect(parseAdminReviewQuery({ status: "hidden", rating: "2", q: " spam ", page: "3" })).toEqual({
      status: "hidden",
      rating: 2,
      q: "spam",
      page: 3,
      pageSize: 20,
    })
    expect(parseAdminReviewQuery({ status: "gone", rating: "0", page: "x" })).toEqual({
      status: undefined,
      rating: undefined,
      q: undefined,
      page: 1,
      pageSize: 20,
    })
  })

  it("builds list links, leaving out defaults", () => {
    expect(adminReviewsHref()).toBe("/admin/reviews")
    expect(adminReviewsHref({ status: "published", rating: 5, q: "mug", page: 2, pageSize: 20 })).toBe(
      "/admin/reviews?status=published&rating=5&q=mug&page=2",
    )
  })
})
