import { Star } from "lucide-react"

import { cn } from "@/lib/utils"

/** A product's average rating and review count, or "No reviews yet" before its first review. */
export function Rating({ rating, reviewCount, className }: { rating: number; reviewCount: number; className?: string }) {
  if (reviewCount === 0) {
    return (
      <div className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <Star className="size-3.5 text-muted-foreground/60" aria-hidden />
        <span>No reviews yet</span>
      </div>
    )
  }
  return (
    <div className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
      <span className="sr-only">Rated</span>
      <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
      <span className="sr-only">out of 5,</span>
      <span>({reviewCount}<span className="sr-only"> reviews</span>)</span>
    </div>
  )
}
