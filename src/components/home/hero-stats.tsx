import { unstable_rethrow } from "next/navigation"

import { logError } from "@/lib/errors"
import { getStoreStats, type StoreStats } from "@/lib/store-stats"

type Stat = { label: string; value: string }

const countFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

// Only figures backed by data are shown: a store without delivered orders or reviews leaves them out.
export function heroStats(stats: StoreStats): Stat[] {
  const items: Stat[] = []
  if (stats.happyCustomers > 0) {
    items.push({ label: "Happy customers", value: countFormat.format(stats.happyCustomers) })
  }
  if (stats.averageDeliveryDays !== null) {
    // Whole days read better than "2.7 days"; anything under a day and a half shows as one day.
    const days = Math.max(1, Math.round(stats.averageDeliveryDays))
    items.push({ label: "Average delivery", value: `${days} ${days === 1 ? "day" : "days"}` })
  }
  if (stats.rating !== null) {
    items.push({ label: "Store rating", value: `${stats.rating.toFixed(1)}/5` })
  }
  return items
}

// The stats must not take the home page down with them: without figures the hero shows none.
async function loadStats() {
  try {
    return heroStats(await getStoreStats())
  } catch (err) {
    unstable_rethrow(err)
    logError(err, "hero.stats")
    return []
  }
}

export async function HeroStats() {
  const stats = await loadStats()
  if (stats.length === 0) return null

  return (
    <dl className="grid max-w-md grid-cols-3 gap-4 pt-4">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt className="text-xs text-muted-foreground">{stat.label}</dt>
          <dd className="text-xl font-semibold">{stat.value}</dd>
        </div>
      ))}
    </dl>
  )
}
