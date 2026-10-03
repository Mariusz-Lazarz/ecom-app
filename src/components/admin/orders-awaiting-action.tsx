import Link from "next/link"
import { ChevronRight, CircleCheck } from "lucide-react"

import { formatOrderDate } from "@/components/orders/format"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { formatPrice } from "@/lib/catalogue"
import type { AdminOrderSummary } from "@/lib/orders"

/** The oldest orders still waiting for the shop, each linking to its admin page; or an all-clear note. */
export function OrdersAwaitingAction({ orders }: { orders: AdminOrderSummary[] }) {
  if (orders.length === 0) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <CircleCheck className="size-4 text-emerald-600" />
        Nothing is waiting: every order has shipped or been closed.
      </p>
    )
  }

  return (
    <ul aria-label="Orders needing attention" className="divide-y">
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/admin/orders/${order.number}`}
            className="-mx-2 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-md px-2 py-3 transition-colors hover:bg-muted/50 sm:grid-cols-[7rem_1fr_auto_auto_auto]"
          >
            <span className="font-semibold">{order.number}</span>
            <span className="justify-self-end sm:order-3">
              <OrderStatusBadge status={order.status} />
            </span>
            <span className="min-w-0 truncate text-sm text-muted-foreground sm:order-2">
              {order.customer.name} · placed{" "}
              <time dateTime={order.createdAt.toISOString()}>{formatOrderDate(order.createdAt)}</time>
            </span>
            <span className="justify-self-end font-medium tabular-nums sm:order-4">
              {formatPrice(order.totalCents, order.currency)}
            </span>
            <ChevronRight aria-hidden className="hidden size-4 text-muted-foreground sm:order-5 sm:block" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
