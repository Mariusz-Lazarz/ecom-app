"use client"

import { useRouter } from "next/navigation"
import { useId, useOptimistic, useTransition } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { catalogueHref, SORT_OPTIONS, type CatalogueQuery } from "@/lib/catalogue"
import type { ProductSort } from "@/lib/validation/products"

type SortSelectProps = {
  basePath: string
  query: CatalogueQuery
}

/** Picking a sort navigates to the same catalogue URL with the new sort, keeping the other filters, on page 1. */
export function SortSelect({ basePath, query }: SortSelectProps) {
  const router = useRouter()
  const labelId = useId()
  // Shows the picked sort straight away, while the sorted page loads.
  const [sort, setSort] = useOptimistic(query.sort)
  const [, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-sm whitespace-nowrap text-muted-foreground">
        Sort by
      </span>
      <Select<ProductSort>
        items={SORT_OPTIONS}
        value={sort}
        onValueChange={(next) => {
          if (!next || next === query.sort) return
          startTransition(() => {
            setSort(next)
            router.push(catalogueHref(basePath, { ...query, sort: next, page: 1 }))
          })
        }}
      >
        <SelectTrigger aria-labelledby={labelId} className="min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="end">
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
