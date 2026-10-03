import { beforeEach, describe, expect, it, vi } from "vitest"

import { NotFoundError } from "@/lib/errors"

const session = vi.hoisted(() => ({ current: null as null | { user: { id?: string; role: "user" | "admin" } } }))
const reviews = vi.hoisted(() => ({
  saveReview: vi.fn(),
  deleteOwnReview: vi.fn(),
  setReviewStatus: vi.fn(),
  deleteReview: vi.fn(),
}))
const revalidatePath = vi.fn()
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
})

vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => session.current }))
// The real module (for NotEligibleToReviewError) with its database functions mocked.
vi.mock("@/lib/reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reviews")>()),
  ...reviews,
}))
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }))

const actions = await import("@/app/actions/reviews")
const { NotEligibleToReviewError } = await import("@/lib/reviews")

const PRODUCT_ID = "5b0e7c1d-2a3f-4b5c-8d9e-0f1a2b3c4d5e"
const REVIEW_ID = "7c1d2a3f-4b5c-4d9e-8f1a-2b3c4d5e6f70"
const asGuest = () => (session.current = null)
const asUser = () => (session.current = { user: { id: "user-1", role: "user" } })
const asAdmin = () => (session.current = { user: { id: "admin-1", role: "admin" } })

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const validForm = () => form({ rating: "5", title: " Great ", body: "Really comfortable all day." })
const save = (data = validForm(), productId = PRODUCT_ID, slug = "trail-mug") =>
  actions.saveReview(productId, slug, undefined, data)

beforeEach(() => {
  asUser()
  for (const fn of Object.values(reviews)) fn.mockReset()
  revalidatePath.mockClear()
  redirect.mockClear()
})

describe("saveReview", () => {
  it("sends signed-out visitors to the login, back to the product's review form", async () => {
    asGuest()

    await expect(save()).rejects.toMatchObject({ message: "NEXT_REDIRECT" })
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/login?callbackUrl=%2Fproducts%2Ftrail-mug%23write-review")
    expect(reviews.saveReview).not.toHaveBeenCalled()
  })

  it("doesn't put a malformed slug in the login link", async () => {
    asGuest()

    await expect(save(validForm(), PRODUCT_ID, "//evil.com")).rejects.toMatchObject({ message: "NEXT_REDIRECT" })
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/login")
  })

  it("saves the parsed review for the session's user and thanks them", async () => {
    reviews.saveReview.mockResolvedValue({ id: REVIEW_ID, created: true })

    const state = await save()

    expect(reviews.saveReview).toHaveBeenCalledExactlyOnceWith("user-1", PRODUCT_ID, {
      rating: 5,
      title: "Great",
      body: "Really comfortable all day.",
    })
    expect(state).toEqual({ ok: true, message: "Thanks for your review!" })
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout")
  })

  it("confirms an edit differently", async () => {
    reviews.saveReview.mockResolvedValue({ id: REVIEW_ID, created: false })

    expect(await save()).toEqual({ ok: true, message: "Your review has been updated." })
  })

  it("returns field errors with the typed values, without writing", async () => {
    const data = form({ rating: "0", title: "", body: "short" })

    const state = await save(data)

    expect(state).toEqual({
      errors: {
        rating: ["Choose a rating from 1 to 5 stars."],
        title: ["Give your review a title."],
        body: ["Write at least 10 characters."],
      },
      values: { rating: "0", title: "", body: "short" },
      message: "Please check the highlighted fields.",
    })
    expect(reviews.saveReview).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("explains when the user hasn't received the product", async () => {
    reviews.saveReview.mockRejectedValue(new NotEligibleToReviewError())

    const state = await save()

    expect(state).toEqual({
      message: "Only customers who received this product can review it.",
      values: { rating: "5", title: " Great ", body: "Really comfortable all day." },
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("passes on a missing product", async () => {
    reviews.saveReview.mockRejectedValue(new NotFoundError("This product no longer exists."))
    expect((await save())?.message).toBe("This product no longer exists.")
  })

  it("hides unexpected errors behind a generic message", async () => {
    reviews.saveReview.mockRejectedValue(new Error("connection reset"))
    expect((await save())?.message).toBe("Something went wrong. Please try again.")
  })

  it("rejects a product id that isn't a UUID without writing", async () => {
    expect(await save(validForm(), "not-a-uuid")).toEqual({ message: "This product no longer exists." })
    expect(reviews.saveReview).not.toHaveBeenCalled()
  })
})

describe("deleteMyReview", () => {
  it("deletes the session user's own review", async () => {
    reviews.deleteOwnReview.mockResolvedValue(undefined)

    expect(await actions.deleteMyReview(PRODUCT_ID, "trail-mug")).toEqual({
      ok: true,
      message: "Your review has been deleted.",
    })
    expect(reviews.deleteOwnReview).toHaveBeenCalledExactlyOnceWith("user-1", PRODUCT_ID)
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout")
  })

  it("reports a review that doesn't exist", async () => {
    reviews.deleteOwnReview.mockRejectedValue(new NotFoundError("You haven't reviewed this product."))

    expect(await actions.deleteMyReview(PRODUCT_ID, "trail-mug")).toEqual({
      ok: false,
      message: "You haven't reviewed this product.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("sends signed-out visitors to the login", async () => {
    asGuest()
    await expect(actions.deleteMyReview(PRODUCT_ID, "trail-mug")).rejects.toMatchObject({ message: "NEXT_REDIRECT" })
    expect(reviews.deleteOwnReview).not.toHaveBeenCalled()
  })
})

describe("moderation actions", () => {
  it("send signed-out visitors to the login, back to the review list", async () => {
    asGuest()

    await expect(actions.setReviewStatus(REVIEW_ID, "hidden")).rejects.toMatchObject({ message: "NEXT_REDIRECT" })
    await expect(actions.deleteReview(REVIEW_ID)).rejects.toMatchObject({ message: "NEXT_REDIRECT" })
    expect(redirect.mock.calls).toEqual([["/login?callbackUrl=%2Fadmin%2Freviews"], ["/login?callbackUrl=%2Fadmin%2Freviews"]])
  })

  it("refuse non-admins without touching the review", async () => {
    asUser()

    expect(await actions.setReviewStatus(REVIEW_ID, "hidden")).toEqual({
      ok: false,
      message: "You don't have access to this action.",
    })
    expect(await actions.deleteReview(REVIEW_ID)).toEqual({ ok: false, message: "You don't have access to this action." })
    expect(reviews.setReviewStatus).not.toHaveBeenCalled()
    expect(reviews.deleteReview).not.toHaveBeenCalled()
  })

  it.each([
    ["hidden", "The review is hidden from the store."],
    ["published", "The review is visible in the store again."],
  ] as const)("set a review %s", async (status, message) => {
    asAdmin()
    reviews.setReviewStatus.mockResolvedValue({ id: REVIEW_ID, status, productSlug: "trail-mug" })

    expect(await actions.setReviewStatus(REVIEW_ID, status)).toEqual({ ok: true, message })
    expect(reviews.setReviewStatus).toHaveBeenCalledExactlyOnceWith(REVIEW_ID, status)
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout")
  })

  it("reject an unknown status", async () => {
    asAdmin()

    expect(await actions.setReviewStatus(REVIEW_ID, "deleted" as never)).toEqual({
      ok: false,
      message: "Choose a valid status.",
    })
    expect(reviews.setReviewStatus).not.toHaveBeenCalled()
  })

  it("delete a review", async () => {
    asAdmin()
    reviews.deleteReview.mockResolvedValue({ productSlug: "trail-mug" })

    expect(await actions.deleteReview(REVIEW_ID)).toEqual({ ok: true, message: "The review has been deleted." })
    expect(reviews.deleteReview).toHaveBeenCalledExactlyOnceWith(REVIEW_ID)
  })

  it("report a review that's gone", async () => {
    asAdmin()
    reviews.deleteReview.mockRejectedValue(new NotFoundError("This review no longer exists."))

    expect(await actions.deleteReview(REVIEW_ID)).toEqual({ ok: false, message: "This review no longer exists." })
    expect(await actions.setReviewStatus("nope", "hidden")).toEqual({ ok: false, message: "This review no longer exists." })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
