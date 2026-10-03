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
import { catalogueHref, paginationRange, type CatalogueQuery } from "@/lib/catalogue"

type PaginationProps = {
  basePath: string
  query: CatalogueQuery
  pageCount: number
}

/** Page links for the catalogue, keeping the other filters. Previous / Next are disabled at either end. */
export function Pagination({ basePath, query, pageCount }: PaginationProps) {
  if (pageCount <= 1) return null
  const page = query.page
  const href = (p: number) => catalogueHref(basePath, { ...query, page: p })
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
