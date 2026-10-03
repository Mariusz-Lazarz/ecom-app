import Link from "next/link"
import { LogIn, MessageSquareText, PackageX } from "lucide-react"

import { auth } from "@/auth"
import { ReviewForm } from "@/components/reviews/review-form"
import { ReviewList } from "@/components/reviews/review-list"
import { ReviewSort } from "@/components/reviews/review-sort"
import { ReviewSummary } from "@/components/reviews/review-summary"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { canReview, getReviewSummary, getUserReview, listProductReviews } from "@/lib/reviews"
import {
  productReviewsHref,
  REVIEW_FORM_ANCHOR,
  REVIEWS_ANCHOR,
  reviewFormHref,
  type ProductReviewQuery,
} from "@/lib/review-utils"
import { loginHref } from "@/lib/safe-redirect"
import { DEFAULT_REVIEWS_SHOWN } from "@/lib/validation/reviews"

type ProductReviewsProps = {
  product: { id: string; slug: string; name: string }
  query: ProductReviewQuery
}

/**
 * The product page's reviews: the summary, the published reviews in the chosen order with "Show
 * more", and the review box. That box holds the form for customers with a delivered order of the
 * product (prefilled when they already reviewed it), says why for other signed-in users, and links
 * signed-out visitors to the login, which brings them back here.
 */
export async function ProductReviews({ product, query }: ProductReviewsProps) {
  const session = await auth()
  const userId = session?.user?.id
  const [summary, list, ownReview, eligible] = await Promise.all([
    getReviewSummary(product.id),
    listProductReviews(product.id, { sort: query.sort, limit: query.shown }),
    userId ? getUserReview(userId, product.id) : null,
    userId ? canReview(userId, product.id) : false,
  ])

  return (
    <section id={REVIEWS_ANCHOR} aria-labelledby="reviews-heading" className="mt-16 scroll-mt-24">
      <h2 id="reviews-heading" className="text-2xl font-semibold tracking-tight">
        Customer reviews
      </h2>
      <div className="mt-6 grid gap-10 lg:grid-cols-[22rem_1fr] lg:gap-12">
        <div className="space-y-6 lg:sticky lg:top-32 lg:self-start">
          <ReviewSummary summary={summary} />
          <Card id={REVIEW_FORM_ANCHOR} className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                {ownReview ? "Edit your review" : "Review this product"}
              </CardTitle>
              <CardDescription>
                {ownReview
                  ? "Changed your mind? Update or delete your review."
                  : "Share your thoughts with other customers."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!userId ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Sign in to review products you&apos;ve received.</p>
                  <Link href={loginHref(reviewFormHref(product.slug))} className={buttonVariants({ variant: "outline" })}>
                    <LogIn data-icon="inline-start" />
                    Sign in to write a review
                  </Link>
                </div>
              ) : eligible || ownReview ? (
                <ReviewForm
                  productId={product.id}
                  slug={product.slug}
                  productName={product.name}
                  review={
                    ownReview
                      ? { rating: ownReview.rating, title: ownReview.title, body: ownReview.body, status: ownReview.status }
                      : null
                  }
                />
              ) : (
                <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="review-not-eligible">
                  <PackageX className="mt-0.5 size-4 shrink-0" />
                  Only customers who received this product can review it.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0">
          {list.total === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MessageSquareText className="size-5" />
              </span>
              <p className="font-semibold">No reviews yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Customers who received the {product.name} can be the first to review it.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Showing {list.items.length} of {list.total} {list.total === 1 ? "review" : "reviews"}
                </p>
                <ReviewSort slug={product.slug} sort={query.sort} shown={query.shown} />
              </div>
              <ReviewList reviews={list.items} />
              {list.items.length < list.total && (
                <div className="flex justify-center">
                  <Link
                    href={productReviewsHref(product.slug, {
                      sort: query.sort,
                      shown: query.shown + DEFAULT_REVIEWS_SHOWN,
                    })}
                    scroll={false}
                    replace
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Show more reviews
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
