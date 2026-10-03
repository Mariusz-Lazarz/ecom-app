import Link from "next/link"
import { ChevronLeft, ChevronRight, Package } from "lucide-react"

import { formatOrderDate } from "@/components/orders/format"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { formatPrice } from "@/lib/catalogue"
import type { OrderSummary, Page } from "@/lib/orders"

const pageHref = (page: number) => (page > 1 ? `/account/orders?page=${page}` : "/account/orders")

/** The customer's orders as rows linking to `/orders/<number>`, with Previous / Next pages, or the empty state. */
export function OrderList({ list }: { list: Page<OrderSummary> }) {
  if (list.total === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Package className="size-6" />
          </span>
          <p className="text-lg font-semibold">No orders yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">When you place an order, it&apos;ll show up here.</p>
          <Link href="/products" className={buttonVariants({ className: "mt-2" })}>
            Browse products
          </Link>
        </CardContent>
      </Card>
    )
  }

  const disabled = buttonVariants({ variant: "ghost", className: "pointer-events-none opacity-50" })

  return (
    <div className="space-y-6">
      {list.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          There&apos;s nothing on this page. <Link href={pageHref(1)} className="underline">Go to the first page</Link>
        </p>
      ) : (
        <ul aria-label="Orders" className="divide-y rounded-xl border bg-card">
          {list.items.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.number}`}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 p-4 transition-colors hover:bg-muted/50 sm:grid-cols-[8rem_1fr_auto_auto_auto] sm:gap-6"
              >
                <span className="font-semibold">{order.number}</span>
                <span className="justify-self-end sm:order-3">
                  <OrderStatusBadge status={order.status} />
                </span>
                <span className="text-sm text-muted-foreground sm:order-2">
                  <time dateTime={order.createdAt.toISOString()}>{formatOrderDate(order.createdAt)}</time>
                  {" · "}
                  {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                </span>
                <span className="justify-self-end font-semibold tabular-nums sm:order-4">
                  {formatPrice(order.totalCents, order.currency)}
                </span>
                <ChevronRight aria-hidden className="hidden size-4 text-muted-foreground sm:order-5 sm:block" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {list.pageCount > 1 && (
        <Pagination aria-label="Pagination">
          <PaginationContent className="gap-2">
            <PaginationItem>
              {list.page > 1 ? (
                <PaginationPrevious href={pageHref(list.page - 1)} rel="prev" aria-label="Previous page" />
              ) : (
                <span aria-disabled className={disabled}>
                  <ChevronLeft /> <span className="hidden sm:block">Previous</span>
                </span>
              )}
            </PaginationItem>
            <PaginationItem>
              <span className="px-2 text-sm text-muted-foreground">
                Page {Math.min(list.page, list.pageCount)} of {list.pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              {list.page < list.pageCount ? (
                <PaginationNext href={pageHref(list.page + 1)} rel="next" aria-label="Next page" />
              ) : (
                <span aria-disabled className={disabled}>
                  <span className="hidden sm:block">Next</span> <ChevronRight />
                </span>
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
