import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { LowStockProducts } from "@/components/admin/low-stock-products"
import { OrderStatCards } from "@/components/admin/order-stats"
import { OrdersAwaitingAction } from "@/components/admin/orders-awaiting-action"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminOrdersHref } from "@/lib/admin-orders"
import { adminProductsHref } from "@/lib/admin-product-list"
import { listLowStockProducts } from "@/lib/admin-products"
import { requireAdmin } from "@/lib/auth-guards"
import { getOrderStats, listOrdersAwaitingAction } from "@/lib/orders"

export const metadata: Metadata = { title: "Dashboard — Admin — Northcart" }

const AWAITING_ACTION_LIMIT = 5
const LOW_STOCK_LIMIT = 5

/**
 * The admin dashboard: order numbers, the oldest orders waiting to be processed or shipped, and
 * the products with the least stock.
 */
export default async function AdminDashboardPage() {
  await requireAdmin("/admin")
  const [stats, awaiting, lowStock] = await Promise.all([
    getOrderStats(),
    listOrdersAwaitingAction(AWAITING_ACTION_LIMIT),
    listLowStockProducts(LOW_STOCK_LIMIT),
  ])

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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Low stock</CardTitle>
          <CardDescription>The products closest to running out.</CardDescription>
          <CardAction>
            <Link href={adminProductsHref({ stock: "low" })} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              All low stock
              <ArrowRight data-icon="inline-end" />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <LowStockProducts products={lowStock} />
        </CardContent>
      </Card>
    </div>
  )
}
