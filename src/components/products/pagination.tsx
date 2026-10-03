import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { catalogueHref, paginationRange, type CatalogueQuery } from "@/lib/catalogue"
import { cn } from "@/lib/utils"

type PaginationProps = {
  basePath: string
  query: CatalogueQuery
  pageCount: number
}

export function Pagination({ basePath, query, pageCount }: PaginationProps) {
  if (pageCount <= 1) return null
  const page = query.page
  const href = (p: number) => catalogueHref(basePath, { ...query, page: p })
  const disabledClass = "pointer-events-none opacity-50"

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={buttonVariants({ variant: "ghost" })}>
          <ChevronLeft /> Previous
        </Link>
      ) : (
        <span aria-disabled className={buttonVariants({ variant: "ghost", className: disabledClass })}>
          <ChevronLeft /> Previous
        </span>
      )}
      <ul className="flex items-center gap-1">
        {paginationRange(page, pageCount).map((item, index) => (
          <li key={item === "ellipsis" ? `ellipsis-${index}` : item}>
            {item === "ellipsis" ? (
              <span className="px-2 text-muted-foreground" aria-hidden>
                …
              </span>
            ) : (
              <Link
                href={href(item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                className={cn(buttonVariants({ variant: item === page ? "outline" : "ghost", size: "icon" }))}
              >
                {item}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {page < pageCount ? (
        <Link href={href(page + 1)} rel="next" className={buttonVariants({ variant: "ghost" })}>
          Next <ChevronRight />
        </Link>
      ) : (
        <span aria-disabled className={buttonVariants({ variant: "ghost", className: disabledClass })}>
          Next <ChevronRight />
        </span>
      )}
    </nav>
  )
}
