import * as z from "zod"
import { describe, expect, it } from "vitest"

import { ReviewSchema } from "@/lib/validation/reviews"

const valid = { rating: "4", title: "  Sturdy mug  ", body: "Keeps coffee hot for ages." }
const errorsOf = (input: Record<string, unknown>) => {
  const result = ReviewSchema.safeParse(input)
  return result.success ? null : z.flattenError(result.error).fieldErrors
}

describe("ReviewSchema", () => {
  it("parses a form post, coercing the rating and trimming the text", () => {
    expect(ReviewSchema.parse(valid)).toEqual({ rating: 4, title: "Sturdy mug", body: "Keeps coffee hot for ages." })
  })

  it.each(["1", "5"])("accepts the boundary rating %s", (rating) => {
    expect(ReviewSchema.parse({ ...valid, rating }).rating).toBe(Number(rating))
  })

  it.each(["", "0", "6", "3.5", "abc", undefined])("rejects the rating %o", (rating) => {
    expect(errorsOf({ ...valid, rating })).toEqual({ rating: ["Choose a rating from 1 to 5 stars."] })
  })

  it("requires a title, not just spaces", () => {
    expect(errorsOf({ ...valid, title: "   " })).toEqual({ title: ["Give your review a title."] })
    expect(errorsOf({ ...valid, title: undefined })).toEqual({ title: ["Give your review a title."] })
  })

  it("allows a 120-character title and rejects 121", () => {
    expect(errorsOf({ ...valid, title: "t".repeat(120) })).toBeNull()
    expect(errorsOf({ ...valid, title: "t".repeat(121) })).toEqual({ title: ["Keep the title under 120 characters."] })
  })

  it("needs at least 10 characters of review after trimming, and at most 2000", () => {
    expect(errorsOf({ ...valid, body: "  123456789  " })).toEqual({ body: ["Write at least 10 characters."] })
    expect(errorsOf({ ...valid, body: "1234567890" })).toBeNull()
    expect(errorsOf({ ...valid, body: "b".repeat(2000) })).toBeNull()
    expect(errorsOf({ ...valid, body: "b".repeat(2001) })).toEqual({ body: ["Keep your review under 2000 characters."] })
  })

  it("reports every invalid field at once", () => {
    expect(Object.keys(errorsOf({}) ?? {}).sort()).toEqual(["body", "rating", "title"])
  })
})
