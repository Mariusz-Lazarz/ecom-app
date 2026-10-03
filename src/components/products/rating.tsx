import { Star } from "lucide-react"

import { cn } from "@/lib/utils"

export function Rating({ rating, reviewCount, className }: { rating: number; reviewCount: number; className?: string }) {
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
