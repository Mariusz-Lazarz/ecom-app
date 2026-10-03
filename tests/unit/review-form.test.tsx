import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { emptyRatingCounts, summarizeRatings } from "@/lib/review-utils"
import type { ReviewFormState } from "@/lib/validation/reviews"

const saveReview = vi.fn<(id: string, slug: string, state: ReviewFormState, data: FormData) => Promise<ReviewFormState>>()
const deleteMyReview = vi.fn()
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock("@/app/actions/reviews", () => ({
  saveReview: (...args: Parameters<typeof saveReview>) => saveReview(...args),
  deleteMyReview: (...args: unknown[]) => deleteMyReview(...args),
}))
vi.mock("@/lib/notify", () => ({ notify }))

const { ReviewForm } = await import("@/components/reviews/review-form")
const { ReviewSummary } = await import("@/components/reviews/review-summary")

const PRODUCT_ID = "5b0e7c1d-2a3f-4b5c-8d9e-0f1a2b3c4d5e"
const renderForm = (review: Parameters<typeof ReviewForm>[0]["review"] = null) =>
  render(<ReviewForm productId={PRODUCT_ID} slug="trail-mug" productName="Trail Mug" review={review} />)

beforeEach(() => {
  saveReview.mockReset()
  deleteMyReview.mockReset()
  notify.success.mockReset()
  notify.error.mockReset()
})

describe("ReviewForm", () => {
  it("posts the picked rating, title and body for this product", async () => {
    saveReview.mockResolvedValue({ ok: true, message: "Thanks for your review!" })
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("radio", { name: /^4 stars/ }))
    await user.type(screen.getByLabelText("Title"), "Sturdy")
    await user.type(screen.getByLabelText("Review"), "Keeps coffee hot.")
    await user.click(screen.getByRole("button", { name: "Submit review" }))

    await vi.waitFor(() => expect(notify.success).toHaveBeenCalledExactlyOnceWith("Thanks for your review!"))
    expect(saveReview).toHaveBeenCalledOnce()
    const [id, slug, , data] = saveReview.mock.calls[0]
    expect([id, slug]).toEqual([PRODUCT_ID, "trail-mug"])
    expect(Object.fromEntries(data)).toEqual({ rating: "4", title: "Sturdy", body: "Keeps coffee hot." })
  })

  it("shows each field's error inline, keeps what was typed and doesn't toast", async () => {
    saveReview.mockResolvedValue({
      errors: { rating: ["Choose a rating from 1 to 5 stars."], body: ["Write at least 10 characters."] },
      values: { rating: "", title: "Sturdy", body: "Short" },
      message: "Please check the highlighted fields.",
    })
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("button", { name: "Submit review" }))

    expect(await screen.findByText("Choose a rating from 1 to 5 stars.")).toBeInTheDocument()
    expect(screen.getByText("Write at least 10 characters.")).toBeInTheDocument()
    expect(screen.getByRole("radiogroup", { name: "Your rating" })).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Review")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Title")).not.toHaveAttribute("aria-invalid")
    expect(screen.getByLabelText("Title")).toHaveValue("Sturdy")
    expect(screen.getByLabelText("Review")).toHaveValue("Short")
    expect(notify.error).not.toHaveBeenCalled()
  })

  it("toasts a refusal that isn't about a field", async () => {
    saveReview.mockResolvedValue({ message: "Only customers who received this product can review it." })
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("button", { name: "Submit review" }))

    await vi.waitFor(() =>
      expect(notify.error).toHaveBeenCalledExactlyOnceWith("Couldn't save your review", {
        description: "Only customers who received this product can review it.",
      }),
    )
  })

  it("prefills an existing review for editing, with a delete button and a note when it's hidden", () => {
    renderForm({ rating: 2, title: "Meh", body: "Chipped quickly.", status: "hidden" })

    expect(screen.getByRole("form", { name: "Edit your review" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /^2 stars/ })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByLabelText("Title")).toHaveValue("Meh")
    expect(screen.getByLabelText("Review")).toHaveValue("Chipped quickly.")
    expect(screen.getByRole("button", { name: "Update review" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete review" })).toBeInTheDocument()
    expect(screen.getByText("Your review is hidden")).toBeInTheDocument()
  })

  it("deletes the review after confirming", async () => {
    deleteMyReview.mockResolvedValue({ ok: true, message: "Your review has been deleted." })
    const user = userEvent.setup()
    renderForm({ rating: 5, title: "Great", body: "Love it, truly.", status: "published" })

    await user.click(screen.getByRole("button", { name: "Delete review" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete review" }))

    await vi.waitFor(() => expect(notify.success).toHaveBeenCalledWith("Your review has been deleted."))
    expect(deleteMyReview).toHaveBeenCalledExactlyOnceWith(PRODUCT_ID, "trail-mug")
  })
})

describe("ReviewSummary", () => {
  it("shows the average, count and a bar per rating", () => {
    render(<ReviewSummary summary={summarizeRatings({ 5: 3, 4: 1, 3: 0, 2: 0, 1: 0 })} />)

    expect(screen.getByTestId("review-average")).toHaveTextContent("4.8")
    expect(screen.getByTestId("review-count")).toHaveTextContent("Based on 4 reviews")
    const bars = screen.getAllByRole("progressbar")
    expect(bars.map((bar) => [bar.getAttribute("aria-label"), bar.getAttribute("aria-valuenow")])).toEqual([
      ["5 stars", "75"],
      ["4 stars", "25"],
      ["3 stars", "0"],
      ["2 stars", "0"],
      ["1 star", "0"],
    ])
    expect(bars[0]).toHaveAttribute("aria-valuetext", "3 reviews (75%)")
  })

  it("says there are no reviews yet, with empty bars", () => {
    render(<ReviewSummary summary={summarizeRatings(emptyRatingCounts())} />)

    expect(screen.getByTestId("review-average")).toHaveTextContent("–")
    expect(screen.getByTestId("review-count")).toHaveTextContent("No reviews yet")
    expect(screen.getAllByRole("progressbar").map((bar) => bar.getAttribute("aria-valuenow"))).toEqual([
      "0",
      "0",
      "0",
      "0",
      "0",
    ])
  })
})
