import type { LucideIcon } from "lucide-react"
import { DollarSign, Package, Receipt, UserPlus } from "lucide-react"

import { DeltaText } from "@/components/admin/analytics/delta"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { compareValues } from "@/lib/admin-analytics"
import type { AnalyticsTotals } from "@/lib/analytics"
import { formatPrice } from "@/lib/catalogue"

const countFormat = new Intl.NumberFormat("en-US")

type Kpi = {
  key: keyof AnalyticsTotals
  label: string
  icon: LucideIcon
  money: boolean
}

const KPIS: Kpi[] = [
  { key: "revenueCents", label: "Revenue", icon: DollarSign, money: true },
  { key: "orders", label: "Orders", icon: Package, money: false },
  { key: "averageOrderCents", label: "Average order", icon: Receipt, money: true },
  { key: "newCustomers", label: "New customers", icon: UserPlus, money: false },
]

const TEST_IDS: Record<keyof AnalyticsTotals, string> = {
  revenueCents: "kpi-revenue",
  orders: "kpi-orders",
  averageOrderCents: "kpi-average-order",
  newCustomers: "kpi-new-customers",
}

type KpiCardsProps = {
  totals: AnalyticsTotals
  // null for all time: nothing to compare with.
  previous: AnalyticsTotals | null
  // "previous 30 days"
  comparisonLabel: string
  currency: string
}

/** Revenue, orders, average order value and new customers, each against the previous period. */
export function KpiCards({ totals, previous, comparisonLabel, currency }: KpiCardsProps) {
  const format = (kpi: Kpi, value: number) => (kpi.money ? formatPrice(value, currency) : countFormat.format(value))

  return (
    <ul aria-label="Key figures" className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
      {KPIS.map((kpi) => {
        const Icon = kpi.icon
        return (
          <li key={kpi.key}>
            <Card className="h-full">
              <CardHeader>
                <CardDescription className="flex items-center gap-2">
                  <Icon aria-hidden className="size-4" />
                  {kpi.label}
                </CardDescription>
                <CardTitle data-testid={TEST_IDS[kpi.key]} className="text-2xl font-semibold tabular-nums sm:text-3xl">
                  {format(kpi, totals[kpi.key])}
                </CardTitle>
              </CardHeader>
              <CardContent className="-mt-2 text-xs text-muted-foreground">
                {previous ? (
                  <p data-testid={`${TEST_IDS[kpi.key]}-delta`}>
                    <DeltaText delta={compareValues(totals[kpi.key], previous[kpi.key])} /> vs {comparisonLabel} (
                    {format(kpi, previous[kpi.key])})
                  </p>
                ) : (
                  <p>{comparisonLabel}</p>
                )}
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
