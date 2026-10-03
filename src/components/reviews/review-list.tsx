import { BadgeCheck } from "lucide-react"

import { Stars } from "@/components/reviews/stars"
import { Badge } from "@/components/ui/badge"
import type { PublicReview } from "@/lib/reviews"

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })

/** One review: stars, title, author, date, the "Verified purchase" badge when earned, and the text. */
export function ReviewItem({ review }: { review: PublicReview }) {
  return (
    <article className="space-y-2" aria-labelledby={`review-${review.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars rating={review.rating} label={`${review.rating} out of 5 stars`} />
        <h3 id={`review-${review.id}`} className="font-semibold">
          {review.title}
        </h3>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{review.author}</span>
        <span aria-hidden>·</span>
        <time dateTime={review.createdAt.toISOString()}>{dateFormat.format(review.createdAt)}</time>
        {review.verified && (
          <Badge
            variant="secondary"
            className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          >
            <BadgeCheck data-icon="inline-start" />
            Verified purchase
          </Badge>
        )}
      </p>
      <p className="leading-relaxed whitespace-pre-line text-muted-foreground">{review.body}</p>
    </article>
  )
}

export function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  return (
    <ul aria-label="Reviews" className="divide-y">
      {reviews.map((review) => (
        <li key={review.id} className="py-5 first:pt-0 last:pb-0">
          <ReviewItem review={review} />
        </li>
      ))}
    </ul>
  )
}
