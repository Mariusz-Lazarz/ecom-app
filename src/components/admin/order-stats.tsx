import Link from "next/link"
import { DollarSign, Package } from "lucide-react"

import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminOrdersHref } from "@/lib/admin-orders"
import { formatPrice } from "@/lib/catalogue"
import { NON_REVENUE_STATUSES, ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/order-rules"
import type { OrderStats } from "@/lib/orders"

const countFormat = new Intl.NumberFormat("en-US")

/**
 * The dashboard's numbers: total orders and revenue, then one card per status. The total and each
 * status card link to the order list (filtered by that status).
 */
export function OrderStatCards({ stats }: { stats: OrderStats }) {
  const excluded = NON_REVENUE_STATUSES.map((status) => ORDER_STATUS_LABELS[status].toLowerCase()).join(" and ")

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={adminOrdersHref()} aria-label={`All orders: ${stats.totalOrders}`} className="group">
          <Card className="h-full transition-colors group-hover:bg-muted/50">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <Package className="size-4" />
                Total orders
              </CardDescription>
              <CardTitle data-testid="stat-total-orders" className="text-3xl font-semibold tabular-nums">
                {countFormat.format(stats.totalOrders)}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="size-4" />
              Revenue
            </CardDescription>
            <CardTitle data-testid="stat-revenue" className="text-3xl font-semibold tabular-nums">
              {formatPrice(stats.revenueCents, stats.currency)}
            </CardTitle>
          </CardHeader>
          <CardContent className="-mt-2 text-xs text-muted-foreground">Excludes {excluded} orders</CardContent>
        </Card>
      </div>

      <ul aria-label="Orders by status" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {ORDER_STATUSES.map((status) => (
          <li key={status}>
            <Link
              href={adminOrdersHref({ status })}
              aria-label={`${ORDER_STATUS_LABELS[status]}: ${stats.counts[status]}`}
              className="group block h-full"
            >
              <Card className="h-full transition-colors group-hover:bg-muted/50">
                <CardHeader>
                  <div>
                    <OrderStatusBadge status={status} />
                  </div>
                  <CardTitle className="text-2xl font-semibold tabular-nums">
                    {countFormat.format(stats.counts[status])}
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
