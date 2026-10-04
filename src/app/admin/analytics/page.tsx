import type { Metadata } from "next"
import Link from "next/link"
import { ChartNoAxesColumn, Download } from "lucide-react"

import { ChartCard } from "@/components/admin/analytics/chart-card"
import { CategoryChart, DailyOrdersChart, DailyRevenueChart, StatusChart } from "@/components/admin/analytics/charts"
import { KpiCards } from "@/components/admin/analytics/kpi-cards"
import { RangeTabs } from "@/components/admin/analytics/range-tabs"
import { DiscountCodesTable, TopProductsTable } from "@/components/admin/analytics/top-tables"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ANALYTICS_RANGE_LABELS,
  adminAnalyticsHref,
  analyticsPeriod,
  dayCount,
  exportDays,
  formatDay,
  formatDayRange,
  ordersExportHref,
  parseAnalyticsRange,
  summarizeDaily,
  utcDayKey,
} from "@/lib/admin-analytics"
import { getAnalytics, type AnalyticsReport } from "@/lib/analytics"
import { requireAdmin } from "@/lib/auth-guards"
import { formatPrice } from "@/lib/catalogue"
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/order-rules"

export const metadata: Metadata = { title: "Analytics — Admin — Northcart" }

const countFormat = new Intl.NumberFormat("en-US")

/**
 * Sales analytics for `?range=` (7, 30 or 90 days, or all time; 30 days by default): key figures
 * against the previous period, daily revenue and orders, orders by status, sales by category, the
 * best-selling products and discount code use, plus a CSV export of the period's orders.
 */
export default async function AdminAnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  await requireAdmin("/admin/analytics")
  const range = parseAnalyticsRange((await searchParams).range)
  const report = await getAnalytics(analyticsPeriod(range))

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          <span data-testid="analytics-period">{formatDayRange(report.range)}</span> (UTC days). Revenue and orders
          leave out cancelled and rejected orders.
        </p>
      </div>

      <RangeTabs
        range={range}
        actions={
          <a
            href={ordersExportHref(exportDays(report.range))}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download data-icon="inline-start" />
            Export orders CSV
          </a>
        }
      >
        <Report report={report} range={range} />
      </RangeTabs>
    </div>
  )
}

function Report({ report, range }: { report: AnalyticsReport; range: ReturnType<typeof parseAnalyticsRange> }) {
  const { currency } = report
  const days = dayCount(report.range)
  const placed = ORDER_STATUSES.reduce((sum, status) => sum + report.statusCounts[status], 0)
  const comparisonLabel = report.previous
    ? `previous ${days} days`
    : `Since ${formatDay(utcDayKey(report.range.from), true)}`

  return (
    <div className="space-y-6">
      <KpiCards
        totals={report.totals}
        previous={report.previousTotals}
        comparisonLabel={comparisonLabel}
        currency={currency}
      />

      {placed === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ChartNoAxesColumn className="size-6" />
            </span>
            <p className="text-lg font-semibold">No orders in this period</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Charts and best sellers show up here once customers place orders.
            </p>
            {range !== "all" && (
              <Link href={adminAnalyticsHref("all")} className={buttonVariants({ variant: "outline", className: "mt-2" })}>
                See {ANALYTICS_RANGE_LABELS.all.toLowerCase()}
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            className="lg:col-span-2"
            title="Revenue per day"
            summary={summarizeDaily(report.daily, "revenue", currency)}
            columns={["Day", "Revenue", "Orders"]}
            rows={report.daily.map((day) => ({
              key: day.date,
              cells: [formatDay(day.date, true), formatPrice(day.revenueCents, currency), countFormat.format(day.orders)],
            }))}
          >
            <DailyRevenueChart data={report.daily} currency={currency} />
          </ChartCard>

          <ChartCard
            title="Orders per day"
            summary={summarizeDaily(report.daily, "orders", currency)}
            columns={["Day", "Orders"]}
            rows={report.daily.map((day) => ({
              key: day.date,
              cells: [formatDay(day.date, true), countFormat.format(day.orders)],
            }))}
          >
            <DailyOrdersChart data={report.daily} />
          </ChartCard>

          <ChartCard
            title="Orders by status"
            summary={statusSummary(report, placed)}
            columns={["Status", "Orders"]}
            rows={ORDER_STATUSES.map((status) => ({
              key: status,
              cells: [ORDER_STATUS_LABELS[status], countFormat.format(report.statusCounts[status])],
            }))}
          >
            <StatusChart counts={report.statusCounts} />
          </ChartCard>

          <ChartCard
            className="lg:col-span-2"
            title="Sales by category"
            summary={categorySummary(report)}
            columns={["Category", "Units", "Sales"]}
            rows={report.categories.map((category) => ({
              key: category.categoryId ?? "deleted",
              cells: [category.name, countFormat.format(category.units), formatPrice(category.revenueCents, currency)],
            }))}
          >
            <CategoryChart
              currency={currency}
              data={report.categories.map((category) => ({
                name: category.name,
                revenueCents: category.revenueCents,
                other: category.categoryId === null,
              }))}
            />
          </ChartCard>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Top products by units</CardTitle>
              <CardDescription>The most items sold.</CardDescription>
            </CardHeader>
            <CardContent>
              <TopProductsTable products={report.topByUnits} label="Top products by units" currency={currency} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Top products by sales</CardTitle>
              <CardDescription>The most money taken, before discounts and shipping.</CardDescription>
            </CardHeader>
            <CardContent>
              <TopProductsTable products={report.topByRevenue} label="Top products by sales" currency={currency} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Discount codes</CardTitle>
              <CardDescription data-testid="analytics-discounts">
                {report.discounts.orders === 0
                  ? "Codes customers used at checkout."
                  : `${formatPrice(report.discounts.totalCents, currency)} off ${countFormat.format(report.discounts.orders)} ${
                      report.discounts.orders === 1 ? "order" : "orders"
                    } with a code.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DiscountCodesTable codes={report.discounts.topCodes} currency={currency} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function statusSummary(report: AnalyticsReport, placed: number) {
  const parts = ORDER_STATUSES.filter((status) => report.statusCounts[status] > 0).map(
    (status) => `${report.statusCounts[status]} ${ORDER_STATUS_LABELS[status].toLowerCase()}`,
  )
  return `${countFormat.format(placed)} ${placed === 1 ? "order" : "orders"} placed: ${parts.join(", ")}.`
}

function categorySummary(report: AnalyticsReport) {
  const [top] = report.categories
  if (!top) return "No items sold in this period."
  const total = report.categories.reduce((sum, category) => sum + category.revenueCents, 0)
  const share = total === 0 ? 0 : Math.round((top.revenueCents / total) * 100)
  return `${top.name} led with ${formatPrice(top.revenueCents, report.currency)}, ${share}% of item sales (before discounts and shipping).`
}
