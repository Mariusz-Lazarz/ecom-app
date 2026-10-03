import Link from "next/link"

import { formatOrderDate } from "@/components/orders/format"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatPrice } from "@/lib/catalogue"
import type { AdminOrderSummary } from "@/lib/orders"

/**
 * The admin order list as a table (it scrolls sideways inside its container on small screens).
 * The order number links to the order's admin page and its hit area covers the whole row. A
 * discount code used on the order shows under its total.
 */
export function AdminOrderTable({ orders }: { orders: AdminOrderSummary[] }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table aria-label="Orders" className="min-w-[44rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Order</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="text-right">Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="pr-4">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="relative">
              <TableCell className="pl-4 font-semibold">
                <Link
                  href={`/admin/orders/${order.number}`}
                  className="before:absolute before:inset-0 hover:underline focus-visible:outline-none focus-visible:before:ring-2 focus-visible:before:ring-ring focus-visible:before:ring-inset"
                >
                  {order.number}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <time dateTime={order.createdAt.toISOString()}>{formatOrderDate(order.createdAt)}</time>
              </TableCell>
              <TableCell>
                <span className="block font-medium">{order.customer.name}</span>
                <span className="block text-xs text-muted-foreground">{order.customer.email}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{order.itemCount}</TableCell>
              <TableCell className="text-right">
                <span className="block font-medium tabular-nums">{formatPrice(order.totalCents, order.currency)}</span>
                {order.discountCode && (
                  <span className="block text-xs text-emerald-600 tabular-nums dark:text-emerald-400">
                    {order.discountCode}
                    {order.discountCents > 0 && ` −${formatPrice(order.discountCents, order.currency)}`}
                  </span>
                )}
              </TableCell>
              <TableCell className="pr-4">
                <OrderStatusBadge status={order.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
