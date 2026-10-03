import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { OrderStatusActions } from "@/components/admin/order-status-actions"
import { countryName, formatOrderDateTime } from "@/components/orders/format"
import { OrderItems } from "@/components/orders/order-items"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { OrderTimeline } from "@/components/orders/order-timeline"
import { OrderTotals } from "@/components/orders/order-totals"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { adminOrdersHref } from "@/lib/admin-orders"
import { requireAdmin } from "@/lib/auth-guards"
import { getOrder } from "@/lib/orders"

export const metadata: Metadata = { title: "Order — Admin — Northcart" }

/**
 * One order as the admin sees it: customer, address, shipping and payment, items, totals, the
 * full history (who made each change, with notes) and the status actions. Unknown numbers → 404.
 */
export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[number]">) {
  const { number } = await params
  await requireAdmin(`/admin/orders/${encodeURIComponent(number)}`)
  const order = await getOrder(number)
  if (!order) notFound()

  const { address, customer } = order

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={adminOrdersHref()}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Orders
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Order {order.number}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Placed <time dateTime={order.createdAt.toISOString()}>{formatOrderDateTime(order.createdAt)}</time>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderStatusActions number={order.number} status={order.status} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Items ({order.itemCount})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <OrderItems items={order.items} currency={order.currency} />
              <div className="border-t pt-4">
                <OrderTotals {...order} />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Customer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-medium">{customer.name}</p>
                <a href={`mailto:${customer.email}`} className="break-all text-muted-foreground hover:underline">
                  {customer.email}
                </a>
                <p>
                  <Link href={adminOrdersHref({ q: customer.email })} className="underline underline-offset-4 hover:text-muted-foreground">
                    Orders from this customer
                  </Link>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Shipping address</CardTitle>
              </CardHeader>
              <CardContent>
                <address className="text-sm leading-relaxed not-italic">
                  {address.fullName}
                  <br />
                  {address.line1}
                  {address.line2 && (
                    <>
                      <br />
                      {address.line2}
                    </>
                  )}
                  <br />
                  {address.postalCode} {address.city}
                  <br />
                  {countryName(address.country)}
                  <br />
                  <span className="text-muted-foreground">{address.phone}</span>
                </address>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Shipping &amp; payment</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Shipping</dt>
                    <dd className="font-medium">{order.shippingMethod.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tracking number</dt>
                    <dd className="font-mono font-medium break-all">{order.trackingNumber ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Payment</dt>
                    <dd className="font-medium">
                      {order.paymentMethod.name}
                      <span className="font-normal text-muted-foreground"> · paid (demo)</span>
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">History</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderTimeline events={order.events} trackingNumber={order.trackingNumber} showActor />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
