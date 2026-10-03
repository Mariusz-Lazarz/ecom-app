"use client"

import Form from "next/form"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useOptimistic, useTransition } from "react"
import { Search, X } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ADMIN_REVIEWS_PATH, adminReviewsHref } from "@/lib/review-utils"
import { cn } from "@/lib/utils"
import {
  DEFAULT_ADMIN_REVIEWS_PAGE_SIZE,
  type AdminReviewListQuery,
  type ReviewStatus,
} from "@/lib/validation/reviews"

type ReviewFiltersProps = {
  query: AdminReviewListQuery
  counts: Record<ReviewStatus, number>
}

const ALL = "all"
const RATING_ITEMS = [
  { value: ALL, label: "All ratings" },
  ...[5, 4, 3, 2, 1].map((stars) => ({ value: String(stars), label: `${stars} ${stars === 1 ? "star" : "stars"}` })),
]

/**
 * The admin review list's filters: status chips with counts, a rating select and a GET search
 * (product, author or title). Each keeps the other filters and goes back to page 1.
 */
export function ReviewFilters({ query, counts }: ReviewFiltersProps) {
  const router = useRouter()
  const ratingLabelId = useId()
  const [rating, setRating] = useOptimistic(query.rating ? String(query.rating) : ALL)
  const [, startTransition] = useTransition()
  const chips: { status?: ReviewStatus; label: string; count: number }[] = [
    { label: "All", count: counts.published + counts.hidden },
    { status: "published", label: "Published", count: counts.published },
    { status: "hidden", label: "Hidden", count: counts.hidden },
  ]

  return (
    <div className="space-y-4">
      <nav aria-label="Filter by status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {chips.map(({ status, label, count }) => {
            const active = query.status === status
            return (
              <li key={label}>
                <Link
                  href={adminReviewsHref({ ...query, status, page: 1 })}
                  aria-current={active ? "page" : undefined}
                  className={cn(buttonVariants({ variant: active ? "default" : "outline", size: "sm" }), "rounded-full")}
                >
                  {label}
                  <span
                    className={cn(
                      "ml-0.5 rounded-full px-1.5 text-xs tabular-nums",
                      active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Form action={ADMIN_REVIEWS_PATH} role="search" aria-label="Search reviews" className="flex flex-1 gap-2 sm:max-w-md">
          {query.status && <input type="hidden" name="status" value={query.status} />}
          {query.rating && <input type="hidden" name="rating" value={query.rating} />}
          {query.pageSize !== DEFAULT_ADMIN_REVIEWS_PAGE_SIZE && (
            <input type="hidden" name="pageSize" value={query.pageSize} />
          )}
          <InputGroup className="h-9">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              // Remount on navigation so the box shows the current search.
              key={query.q ?? ""}
              type="search"
              name="q"
              defaultValue={query.q ?? ""}
              maxLength={100}
              placeholder="Product, author or title"
              aria-label="Product, author or title"
            />
          </InputGroup>
          <Button type="submit" className="h-9">
            Search
          </Button>
          {query.q && (
            <Link
              href={adminReviewsHref({ ...query, q: undefined, page: 1 })}
              className={buttonVariants({ variant: "ghost", className: "h-9" })}
            >
              <X data-icon="inline-start" />
              Clear
            </Link>
          )}
        </Form>

        <span id={ratingLabelId} className="sr-only">
          Rating
        </span>
        <Select<string>
          items={RATING_ITEMS}
          value={rating}
          onValueChange={(next) => {
            if (!next || next === (query.rating ? String(query.rating) : ALL)) return
            startTransition(() => {
              setRating(next)
              router.push(adminReviewsHref({ ...query, rating: next === ALL ? undefined : Number(next), page: 1 }))
            })
          }}
        >
          <SelectTrigger aria-labelledby={ratingLabelId} className="h-9 min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {RATING_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
