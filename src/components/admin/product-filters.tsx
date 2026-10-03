"use client"

import Form from "next/form"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useOptimistic, useTransition } from "react"
import { Search, TriangleAlert, X } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ADMIN_PRODUCTS_PATH, adminProductsHref } from "@/lib/admin-product-list"
import { cn } from "@/lib/utils"
import {
  DEFAULT_ADMIN_PRODUCTS_PAGE_SIZE,
  LOW_STOCK_THRESHOLD,
  type AdminProductListQuery,
} from "@/lib/validation/admin-products"

type ProductFiltersProps = {
  query: AdminProductListQuery
  categories: { slug: string; name: string }[]
}

const ALL = "all"

/**
 * The admin product list's filters: a GET search (name, brand or slug), a category select and a
 * "Low stock" toggle. Each keeps the other filters and goes back to page 1.
 */
export function ProductFilters({ query, categories }: ProductFiltersProps) {
  const router = useRouter()
  const categoryLabelId = useId()
  const [category, setCategory] = useOptimistic(query.category ?? ALL)
  const [, startTransition] = useTransition()
  const items = [{ value: ALL, label: "All categories" }, ...categories.map((c) => ({ value: c.slug, label: c.name }))]
  const lowStock = query.stock === "low"

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <Form action={ADMIN_PRODUCTS_PATH} role="search" aria-label="Search products" className="flex flex-1 gap-2 lg:max-w-md">
        {query.category && <input type="hidden" name="category" value={query.category} />}
        {query.stock && <input type="hidden" name="stock" value={query.stock} />}
        {query.pageSize !== DEFAULT_ADMIN_PRODUCTS_PAGE_SIZE && (
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
            placeholder="Name, brand or slug"
            aria-label="Name, brand or slug"
          />
        </InputGroup>
        <Button type="submit" className="h-9">
          Search
        </Button>
        {query.q && (
          <Link
            href={adminProductsHref({ ...query, q: undefined, page: 1 })}
            className={buttonVariants({ variant: "ghost", className: "h-9" })}
          >
            <X data-icon="inline-start" />
            Clear
          </Link>
        )}
      </Form>

      <div className="flex flex-wrap items-center gap-2">
        <span id={categoryLabelId} className="sr-only">
          Category
        </span>
        <Select<string>
          items={items}
          value={category}
          onValueChange={(next) => {
            if (!next || next === (query.category ?? ALL)) return
            startTransition(() => {
              setCategory(next)
              router.push(adminProductsHref({ ...query, category: next === ALL ? undefined : next, page: 1 }))
            })
          }}
        >
          <SelectTrigger aria-labelledby={categoryLabelId} className="h-9 min-w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Link
          href={adminProductsHref({ ...query, stock: lowStock ? undefined : "low", page: 1 })}
          aria-current={lowStock ? "true" : undefined}
          title={`Stock of ${LOW_STOCK_THRESHOLD} or less`}
          className={cn(buttonVariants({ variant: lowStock ? "default" : "outline" }), "h-9 rounded-full")}
        >
          <TriangleAlert data-icon="inline-start" />
          Low stock
        </Link>
      </div>
    </div>
  )
}
