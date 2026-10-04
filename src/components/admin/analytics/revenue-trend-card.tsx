import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { RevenueSparkline } from "@/components/admin/analytics/charts"
import { DeltaText } from "@/components/admin/analytics/delta"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminAnalyticsHref, compareValues, dayCount, summarizeDaily } from "@/lib/admin-analytics"
import type { RevenueTrend } from "@/lib/analytics"
import { formatPrice } from "@/lib/catalogue"

/** The dashboard's revenue card: the period's total against the one before, a sparkline, and a link to analytics. */
export function RevenueTrendCard({ trend }: { trend: RevenueTrend }) {
  const days = dayCount(trend.range)
  const summary = summarizeDaily(trend.daily, "revenue", trend.currency)

  return (
    <Card>
      <CardHeader>
        <CardDescription>Revenue, last {days} days</CardDescription>
        <CardTitle data-testid="dashboard-revenue-trend" className="text-3xl font-semibold tabular-nums">
          {formatPrice(trend.revenueCents, trend.currency)}
        </CardTitle>
        <CardAction>
          <Link href={adminAnalyticsHref()} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Analytics
            <ArrowRight data-icon="inline-end" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          <DeltaText delta={compareValues(trend.revenueCents, trend.previousRevenueCents)} /> vs the {days} days before (
          {formatPrice(trend.previousRevenueCents, trend.currency)})
        </p>
        <figure aria-label={`Daily revenue, last ${days} days. ${summary}`}>
          <RevenueSparkline data={trend.daily} />
        </figure>
      </CardContent>
    </Card>
  )
}
