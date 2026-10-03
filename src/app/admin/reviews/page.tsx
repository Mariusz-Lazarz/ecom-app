import type { Metadata } from "next"
import Link from "next/link"
import { SearchX } from "lucide-react"

import { AdminReviewTable } from "@/components/admin/admin-review-table"
import { ReviewFilters } from "@/components/admin/review-filters"
import { PaginationNav } from "@/components/pagination-nav"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireAdmin } from "@/lib/auth-guards"
import { getReviewStatusCounts, listAdminReviews } from "@/lib/reviews"
import { ADMIN_REVIEWS_PATH, adminReviewsHref, parseAdminReviewQuery } from "@/lib/review-utils"

export const metadata: Metadata = { title: "Reviews — Admin — Northcart" }

/**
 * Every review, newest first, filtered by `?status=` and `?rating=`, searched by `?q=` (product,
 * author or title), paginated with `?page=`. Each row can be hidden, unhidden or deleted. Invalid
 * params fall back to their defaults.
 */
export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requireAdmin(ADMIN_REVIEWS_PATH)
  const query = parseAdminReviewQuery(await searchParams)
  const [list, counts] = await Promise.all([listAdminReviews(query), getReviewStatusCounts()])

  const filtered = Boolean(query.status || query.rating || query.q)
  const showing =
    list.total === 0
      ? null
      : `${list.total} ${list.total === 1 ? "review" : "reviews"}${query.status ? ` · ${query.status}` : ""}${query.rating ? ` · ${query.rating} ${query.rating === 1 ? "star" : "stars"}` : ""}${query.q ? ` matching “${query.q}”` : ""}`

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Reviews</h1>

      <ReviewFilters query={query} counts={counts} />

      {list.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <SearchX className="size-6" />
            </span>
            <p className="text-lg font-semibold">{list.total === 0 ? "No reviews found" : "Nothing on this page"}</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {list.total > 0
                ? `There ${list.pageCount === 1 ? "is only 1 page" : `are only ${list.pageCount} pages`} of reviews.`
                : filtered
                  ? "No reviews match these filters."
                  : "When customers review products, they'll show up here."}
            </p>
            {(filtered || list.total > 0) && (
              <Link
                href={list.total > 0 ? adminReviewsHref({ ...query, page: 1 }) : adminReviewsHref()}
                className={buttonVariants({ variant: "outline", className: "mt-2" })}
              >
                {list.total > 0 ? "Go to the first page" : "Clear filters"}
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {showing}
          </p>
          <AdminReviewTable reviews={list.items} />
        </div>
      )}

      <PaginationNav page={query.page} pageCount={list.pageCount} href={(page) => adminReviewsHref({ ...query, page })} />
    </div>
  )
}
