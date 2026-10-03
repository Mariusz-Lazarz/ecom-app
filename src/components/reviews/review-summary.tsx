import { Stars } from "@/components/reviews/stars"
import { Progress } from "@/components/ui/progress"
import type { RatingSummary } from "@/lib/review-utils"

/** The average, the review count and a 5→1 star bar for each rating's share of the reviews. */
export function ReviewSummary({ summary }: { summary: RatingSummary }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <p className="text-5xl font-semibold tracking-tight tabular-nums" data-testid="review-average">
          {summary.total ? summary.average.toFixed(1) : "–"}
        </p>
        <div className="space-y-1">
          <Stars rating={summary.average} label={`Rated ${summary.average.toFixed(1)} out of 5`} className="[&_svg]:size-5" />
          <p className="text-sm text-muted-foreground" data-testid="review-count">
            {summary.total === 0
              ? "No reviews yet"
              : `Based on ${summary.total} ${summary.total === 1 ? "review" : "reviews"}`}
          </p>
        </div>
      </div>
      <ul aria-label="Rating distribution" className="space-y-2">
        {summary.distribution.map(({ stars, count, percent }) => (
          <li key={stars}>
            <Progress
              value={percent}
              aria-label={`${stars} ${stars === 1 ? "star" : "stars"}`}
              aria-valuetext={`${count} ${count === 1 ? "review" : "reviews"} (${percent}%)`}
              className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-3 text-sm [&_[data-slot=progress-indicator]]:bg-amber-400 [&_[data-slot=progress-track]]:h-2"
            >
              <span className="text-muted-foreground tabular-nums">
                {stars} {stars === 1 ? "star" : "stars"}
              </span>
              <span className="order-last text-right text-muted-foreground tabular-nums">{count}</span>
            </Progress>
          </li>
        ))}
      </ul>
    </div>
  )
}
