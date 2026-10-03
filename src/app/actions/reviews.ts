"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import * as z from "zod"

import { auth } from "@/auth"
import { AppError, ForbiddenError, GENERIC_MESSAGE, logError } from "@/lib/errors"
import * as reviews from "@/lib/reviews"
import { ADMIN_REVIEWS_PATH, reviewFormHref } from "@/lib/review-utils"
import { loginHref } from "@/lib/safe-redirect"
import {
  REVIEW_STATUSES,
  ReviewSchema,
  type ReviewField,
  type ReviewFormState,
  type ReviewStatus,
} from "@/lib/validation/reviews"

/**
 * Review Server Actions. The session is read here on every call: signed-out callers are sent to
 * /login (and back afterwards), eligibility is checked by `@/lib/reviews` inside the write, and the
 * moderation actions re-check the admin role. Expected failures come back as a `message`; anything
 * else is logged and reported generically.
 */

export type ReviewActionResult = { ok: boolean; message: string }

const NO_ACCESS = "You don't have access to this action."
const uuid = z.uuid()
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const REVIEW_FIELDS = ["rating", "title", "body"] as const satisfies readonly ReviewField[]

function expectedMessage(err: unknown, scope: string) {
  logError(err, scope)
  return err instanceof AppError && err.status < 500 ? err.message : GENERIC_MESSAGE
}

async function requireUserId(slug: string): Promise<string> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect(loginHref(slugSchema.safeParse(slug).success ? reviewFormHref(slug) : null))
  return userId
}

/**
 * Writes or edits the signed-in customer's review of a product. For
 * `useActionState(saveReview.bind(null, productId, slug), …)`. Returns field `errors` with the
 * typed `values`, a `message` when they may not review the product, or `ok` with a thank-you.
 */
export async function saveReview(
  productId: string,
  slug: string,
  _state: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const userId = await requireUserId(slug)
  if (!uuid.safeParse(productId).success) return { message: "This product no longer exists." }

  const values: Partial<Record<ReviewField, string>> = {}
  for (const field of REVIEW_FIELDS) {
    const value = formData.get(field)
    if (typeof value === "string") values[field] = value
  }
  const parsed = ReviewSchema.safeParse(values)
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values, message: "Please check the highlighted fields." }
  }

  let created: boolean
  try {
    ;({ created } = await reviews.saveReview(userId, productId, parsed.data))
  } catch (err) {
    return { message: expectedMessage(err, "reviews.save"), values }
  }

  // Ratings show up across the storefront (cards, search, product page): drop every cached page.
  revalidatePath("/", "layout")
  return { ok: true, message: created ? "Thanks for your review!" : "Your review has been updated." }
}

/** Deletes the signed-in customer's own review of a product. */
export async function deleteMyReview(productId: string, slug: string): Promise<ReviewActionResult> {
  const userId = await requireUserId(slug)
  if (!uuid.safeParse(productId).success) return { ok: false, message: "This product no longer exists." }
  try {
    await reviews.deleteOwnReview(userId, productId)
  } catch (err) {
    return { ok: false, message: expectedMessage(err, "reviews.delete-own") }
  }
  revalidatePath("/", "layout")
  return { ok: true, message: "Your review has been deleted." }
}

async function requireAdminAction(scope: string): Promise<boolean> {
  const session = await auth()
  if (!session?.user?.id) redirect(loginHref(ADMIN_REVIEWS_PATH))
  if (session.user.role !== "admin") {
    logError(new ForbiddenError("Review moderation by a non-admin"), scope)
    return false
  }
  return true
}

/** Publishes or hides a review (admins only). */
export async function setReviewStatus(id: string, status: ReviewStatus): Promise<ReviewActionResult> {
  const scope = "reviews.moderate"
  if (!(await requireAdminAction(scope))) return { ok: false, message: NO_ACCESS }
  if (!uuid.safeParse(id).success) return { ok: false, message: "This review no longer exists." }
  if (!REVIEW_STATUSES.includes(status)) return { ok: false, message: "Choose a valid status." }

  try {
    await reviews.setReviewStatus(id, status)
  } catch (err) {
    return { ok: false, message: expectedMessage(err, scope) }
  }
  revalidatePath("/", "layout")
  return {
    ok: true,
    message: status === "hidden" ? "The review is hidden from the store." : "The review is visible in the store again.",
  }
}

/** Deletes any review (admins only). */
export async function deleteReview(id: string): Promise<ReviewActionResult> {
  const scope = "reviews.delete"
  if (!(await requireAdminAction(scope))) return { ok: false, message: NO_ACCESS }
  if (!uuid.safeParse(id).success) return { ok: false, message: "This review no longer exists." }

  try {
    await reviews.deleteReview(id)
  } catch (err) {
    return { ok: false, message: expectedMessage(err, scope) }
  }
  revalidatePath("/", "layout")
  return { ok: true, message: "The review has been deleted." }
}
