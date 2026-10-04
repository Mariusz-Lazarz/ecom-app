import type { Metadata } from "next"
import Link from "next/link"
import { Download, SearchX } from "lucide-react"

import { AdminOrderTable } from "@/components/admin/admin-order-table"
import { OrderFilters } from "@/components/admin/order-filters"
import { PaginationNav } from "@/components/pagination-nav"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ordersExportHref } from "@/lib/admin-analytics"
import { adminOrdersHref, parseAdminOrderQuery } from "@/lib/admin-orders"
import { requireAdmin } from "@/lib/auth-guards"
import { ORDER_STATUS_LABELS } from "@/lib/order-rules"
import { getOrderStats, listOrders } from "@/lib/orders"

export const metadata: Metadata = { title: "Orders — Admin — Northcart" }

/**
 * Every order, newest first, filtered by `?status=` and searched by `?q=` (order number or
 * customer email), paginated with `?page=`. Invalid params fall back to their defaults. "Export
 * CSV" downloads every order matching the current status and search.
 */
export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdmin("/admin/orders")
  const query = parseAdminOrderQuery(await searchParams)
  const [list, stats] = await Promise.all([listOrders(query), getOrderStats()])

  const filtered = Boolean(query.status || query.q)
  const showing =
    list.total === 0
      ? null
      : `${list.total} ${list.total === 1 ? "order" : "orders"}${query.status ? ` · ${ORDER_STATUS_LABELS[query.status]}` : ""}${query.q ? ` matching “${query.q}”` : ""}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
        <a
          href={ordersExportHref({ status: query.status, q: query.q })}
          download
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download data-icon="inline-start" />
          Export CSV
        </a>
      </div>

      <OrderFilters query={query} counts={stats.counts} totalOrders={stats.totalOrders} />

      {list.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <SearchX className="size-6" />
            </span>
            <p className="text-lg font-semibold">{list.total === 0 ? "No orders found" : "Nothing on this page"}</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {list.total > 0
                ? `There ${list.pageCount === 1 ? "is only 1 page" : `are only ${list.pageCount} pages`} of orders.`
                : filtered
                  ? "No orders match these filters."
                  : "When customers place orders, they'll show up here."}
            </p>
            {(filtered || list.total > 0) && (
              <Link
                href={list.total > 0 ? adminOrdersHref({ ...query, page: 1 }) : adminOrdersHref()}
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
          <AdminOrderTable orders={list.items} />
        </div>
      )}

      <PaginationNav
        page={query.page}
        pageCount={list.pageCount}
        href={(page) => adminOrdersHref({ ...query, page })}
      />
    </div>
  )
}
