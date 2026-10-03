import Form from "next/form"
import Link from "next/link"
import { Search, X } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ADMIN_ORDERS_PATH, adminOrdersHref } from "@/lib/admin-orders"
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-rules"
import { cn } from "@/lib/utils"
import { DEFAULT_ORDERS_PAGE_SIZE, type OrderListQuery } from "@/lib/validation/orders"

type OrderFiltersProps = {
  query: OrderListQuery
  counts: Record<OrderStatus, number>
  totalOrders: number
}

/**
 * The admin order list's filters: status chips with counts (All + each status; the search is kept,
 * the page isn't) and a GET search form for an order number or email that keeps the status.
 */
export function OrderFilters({ query, counts, totalOrders }: OrderFiltersProps) {
  const chips: { status?: OrderStatus; label: string; count: number }[] = [
    { label: "All", count: totalOrders },
    ...ORDER_STATUSES.map((status) => ({ status, label: ORDER_STATUS_LABELS[status], count: counts[status] })),
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
                  href={adminOrdersHref({ status, q: query.q, pageSize: query.pageSize })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: active ? "default" : "outline", size: "sm" }),
                    "rounded-full",
                  )}
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

      <Form action={ADMIN_ORDERS_PATH} role="search" aria-label="Search orders" className="flex max-w-xl gap-2">
        {query.status && <input type="hidden" name="status" value={query.status} />}
        {query.pageSize !== DEFAULT_ORDERS_PAGE_SIZE && <input type="hidden" name="pageSize" value={query.pageSize} />}
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
            placeholder="Order number or email"
            aria-label="Order number or email"
          />
        </InputGroup>
        <Button type="submit" className="h-9">
          Search
        </Button>
        {query.q && (
          <Link
            href={adminOrdersHref({ status: query.status, pageSize: query.pageSize })}
            className={buttonVariants({ variant: "ghost", className: "h-9" })}
          >
            <X data-icon="inline-start" />
            Clear
          </Link>
        )}
      </Form>
    </div>
  )
}
