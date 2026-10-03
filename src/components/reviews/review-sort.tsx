"use client"

import { useRouter } from "next/navigation"
import { useId, useOptimistic, useTransition } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { productReviewsHref, REVIEW_SORT_OPTIONS } from "@/lib/review-utils"
import type { ReviewSort as ReviewSortValue } from "@/lib/validation/reviews"

/** Picking a sort reloads the product page's reviews in that order, keeping the scroll position. */
export function ReviewSort({ slug, sort, shown }: { slug: string; sort: ReviewSortValue; shown: number }) {
  const router = useRouter()
  const labelId = useId()
  const [current, setCurrent] = useOptimistic(sort)
  const [, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-sm whitespace-nowrap text-muted-foreground">
        Sort by
      </span>
      <Select<ReviewSortValue>
        items={REVIEW_SORT_OPTIONS}
        value={current}
        onValueChange={(next) => {
          if (!next || next === sort) return
          startTransition(() => {
            setCurrent(next)
            router.replace(productReviewsHref(slug, { sort: next, shown }), { scroll: false })
          })
        }}
      >
        <SelectTrigger aria-labelledby={labelId} className="min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="end">
          {REVIEW_SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
