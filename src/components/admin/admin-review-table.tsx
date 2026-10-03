import Link from "next/link"
import { BadgeCheck } from "lucide-react"

import { ReviewActions } from "@/components/admin/review-actions"
import { Stars } from "@/components/reviews/stars"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AdminReview } from "@/lib/reviews"
import { cn } from "@/lib/utils"

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })

export function ReviewStatusBadge({ status }: { status: AdminReview["status"] }) {
  return (
    <Badge
      variant="secondary"
      data-status={status}
      className={cn(
        status === "published"
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-muted text-muted-foreground",
      )}
    >
      {status === "published" ? "Published" : "Hidden"}
    </Badge>
  )
}

/**
 * The admin review list as a table (it scrolls sideways inside its container on small screens),
 * with moderation actions on every row.
 */
export function AdminReviewTable({ reviews }: { reviews: AdminReview[] }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table aria-label="Reviews" className="min-w-[60rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Review</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Author</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="pr-4 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviews.map((review) => (
            <TableRow key={review.id} data-status={review.status}>
              <TableCell className="max-w-96 pl-4 align-top whitespace-normal">
                <Stars rating={review.rating} label={`${review.rating} out of 5 stars`} className="[&_svg]:size-3.5" />
                <p className="mt-1 font-medium">{review.title}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{review.body}</p>
              </TableCell>
              <TableCell className="max-w-56 align-top">
                <Link href={`/products/${review.product.slug}#reviews`} className="block truncate hover:underline">
                  {review.product.name}
                </Link>
              </TableCell>
              <TableCell className="max-w-56 align-top">
                <span className="flex items-center gap-1 truncate font-medium">
                  {review.author.name}
                  {review.verified && (
                    <BadgeCheck aria-label="Verified purchase" className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{review.author.email}</span>
              </TableCell>
              <TableCell className="align-top">
                <ReviewStatusBadge status={review.status} />
              </TableCell>
              <TableCell className="align-top text-muted-foreground">
                <time dateTime={review.createdAt.toISOString()}>{dateFormat.format(review.createdAt)}</time>
              </TableCell>
              <TableCell className="pr-4 align-top">
                <ReviewActions
                  id={review.id}
                  status={review.status}
                  title={review.title}
                  author={review.author.name}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
