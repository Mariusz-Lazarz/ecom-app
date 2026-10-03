import { ChevronLeft, ChevronRight } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { paginationRange } from "@/lib/catalogue"

type PaginationNavProps = {
  page: number
  pageCount: number
  // The link to a page, keeping the list's other filters.
  href: (page: number) => string
}

/**
 * Numbered page links (catalogue, admin order list) with Previous / Next, which are disabled at
 * either end. Renders nothing for a single page.
 */
export function PaginationNav({ page, pageCount, href }: PaginationNavProps) {
  if (pageCount <= 1) return null
  const disabled = buttonVariants({ variant: "ghost", className: "pointer-events-none opacity-50" })

  return (
    <PaginationRoot aria-label="Pagination">
      <PaginationContent className="flex-wrap justify-center gap-1">
        <PaginationItem>
          {page > 1 ? (
            <PaginationPrevious href={href(page - 1)} rel="prev" aria-label="Previous page" />
          ) : (
            <span aria-disabled className={disabled}>
              <ChevronLeft /> <span className="hidden sm:block">Previous</span>
            </span>
          )}
        </PaginationItem>
        {paginationRange(page, pageCount).map((item, index) =>
          item === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink href={href(item)} aria-label={`Page ${item}`} isActive={item === page}>
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          {page < pageCount ? (
            <PaginationNext href={href(page + 1)} rel="next" aria-label="Next page" />
          ) : (
            <span aria-disabled className={disabled}>
              <span className="hidden sm:block">Next</span> <ChevronRight />
            </span>
          )}
        </PaginationItem>
      </PaginationContent>
    </PaginationRoot>
  )
}
