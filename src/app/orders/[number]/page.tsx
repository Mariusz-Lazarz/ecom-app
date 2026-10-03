import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft, CircleCheck } from "lucide-react"

import { CancelOrderButton } from "@/components/orders/cancel-order-button"
import { countryName, formatOrderDateTime } from "@/components/orders/format"
import { OrderItems } from "@/components/orders/order-items"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { OrderTimeline } from "@/components/orders/order-timeline"
import { OrderTotals } from "@/components/orders/order-totals"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/auth-guards"
import { canCustomerCancel, findShippingMethod } from "@/lib/order-rules"
import { getOrderForUser, type OrderDetail } from "@/lib/orders"
import { formatDeliveryWindow } from "@/lib/shipping"

export const metadata: Metadata = { title: "Your order — Northcart" }

// How long after placing it an untouched order still gets the thank-you header.
const JUST_PLACED_MS = 15 * 60 * 1000

function isJustPlaced(order: OrderDetail, now = Date.now()) {
  return order.status === "pending" && order.events.length === 1 && now - order.createdAt.getTime() < JUST_PLACED_MS
}

/** One of the signed-in customer's orders; anyone else's (or an unknown number) is a 404. */
export default async function OrderPage({ params }: PageProps<"/orders/[number]">) {
  const { number } = await params
  const session = await requireUser(`/orders/${encodeURIComponent(number)}`)
  const order = await getOrderForUser(session.user.id, number)
  if (!order) notFound()

  const justPlaced = isJustPlaced(order)
  const delivery = findShippingMethod(order.shippingMethod.id)
  const { address } = order

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/account/orders"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Your orders
        </Link>

        {justPlaced && (
          <section
            aria-label="Order confirmation"
            className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          >
            <CircleCheck className="mt-0.5 size-6 shrink-0" />
            <div>
              <p className="text-lg font-semibold">Thank you for your order!</p>
              <p className="text-sm">
                We&apos;ve received order {order.number} and will let you know when it ships.
              </p>
            </div>
          </section>
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">Order {order.number}</h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Placed <time dateTime={order.createdAt.toISOString()}>{formatOrderDateTime(order.createdAt)}</time>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCustomerCancel(order.status) && <CancelOrderButton number={order.number} />}
            <Link href="/products" className={buttonVariants({ variant: "ghost" })}>
              Continue shopping
            </Link>
          </div>
        </div>

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

            <div className="grid gap-6 sm:grid-cols-2">
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
                      <dd className="font-medium">
                        {order.shippingMethod.name}
                        {delivery && (
                          <span className="font-normal text-muted-foreground"> · {formatDeliveryWindow(delivery)}</span>
                        )}
                      </dd>
                    </div>
                    {order.trackingNumber && (
                      <div>
                        <dt className="text-muted-foreground">Tracking number</dt>
                        <dd className="font-mono font-medium">{order.trackingNumber}</dd>
                      </div>
                    )}
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

          <Card className="lg:sticky lg:top-32">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Order status</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderTimeline events={order.events} trackingNumber={order.trackingNumber} />
            </CardContent>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
