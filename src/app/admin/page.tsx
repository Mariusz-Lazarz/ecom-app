import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { OrderStatCards } from "@/components/admin/order-stats"
import { OrdersAwaitingAction } from "@/components/admin/orders-awaiting-action"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminOrdersHref } from "@/lib/admin-orders"
import { requireAdmin } from "@/lib/auth-guards"
import { getOrderStats, listOrdersAwaitingAction } from "@/lib/orders"

export const metadata: Metadata = { title: "Dashboard — Admin — Northcart" }

const AWAITING_ACTION_LIMIT = 5

/** The admin dashboard: order numbers and the oldest orders waiting to be processed or shipped. */
export default async function AdminDashboardPage() {
  await requireAdmin("/admin")
  const [stats, awaiting] = await Promise.all([getOrderStats(), listOrdersAwaitingAction(AWAITING_ACTION_LIMIT)])

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>

      <OrderStatCards stats={stats} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Needs attention</CardTitle>
          <CardDescription>The oldest orders still pending or processing.</CardDescription>
          <CardAction>
            <Link href={adminOrdersHref()} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              All orders
              <ArrowRight data-icon="inline-end" />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <OrdersAwaitingAction orders={awaiting} />
        </CardContent>
      </Card>
    </div>
  )
}
