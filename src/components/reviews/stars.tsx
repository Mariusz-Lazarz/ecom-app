import { Star } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Five stars filled up to `rating` (fractions fill part of a star). Decorative by default; pass a
 * `label` to have it read out (e.g. "Rated 4.5 out of 5").
 */
export function Stars({ rating, label, className }: { rating: number; label?: string; className?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex items-center gap-0.5 [&_svg]:size-4", className)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, rating - (star - 1)))
        return (
          <span key={star} className="relative inline-flex">
            <Star className="text-muted-foreground/40" />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="fill-amber-400 text-amber-400" />
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}
