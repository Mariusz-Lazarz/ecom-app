import Link from "next/link"

import { ReviewStatusBadge } from "@/components/admin/admin-review-table"
import { Stars } from "@/components/reviews/stars"
import type { AdminReview } from "@/lib/reviews"

/** The dashboard's most recent reviews: stars, title, product, author and status. */
export function LatestReviews({ reviews }: { reviews: AdminReview[] }) {
  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">No reviews yet.</p>
  }
  return (
    <ul aria-label="Latest reviews" className="divide-y">
      {reviews.map((review) => (
        <li key={review.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 space-y-0.5">
            <Stars rating={review.rating} label={`${review.rating} out of 5 stars`} className="[&_svg]:size-3.5" />
            <p className="truncate font-medium">{review.title}</p>
            <p className="truncate text-sm text-muted-foreground">
              <Link href={`/products/${review.product.slug}#reviews`} className="hover:text-foreground hover:underline">
                {review.product.name}
              </Link>{" "}
              · {review.author.name}
            </p>
          </div>
          <ReviewStatusBadge status={review.status} />
        </li>
      ))}
    </ul>
  )
}
