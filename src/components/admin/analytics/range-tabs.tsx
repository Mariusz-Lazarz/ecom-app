"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useTransition, type ReactNode } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ANALYTICS_RANGES, ANALYTICS_RANGE_LABELS, adminAnalyticsHref, type AnalyticsRange } from "@/lib/admin-analytics"
import { cn } from "@/lib/utils"

type RangeTabsProps = {
  range: AnalyticsRange
  // Extra controls on the tab row's right (e.g. the export link).
  actions?: ReactNode
  // The report for `range`, rendered by the server into the active panel.
  children: ReactNode
}

/**
 * The analytics period picker: one tab per preset. Choosing one navigates to `?range=` (so the
 * period is in the URL and the report is rendered on the server); the tab switches at once and the
 * old report fades while the new one loads.
 */
export function RangeTabs({ range, actions, children }: RangeTabsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useOptimistic(range)

  return (
    <Tabs
      value={selected}
      onValueChange={(value) => {
        const next = value as AnalyticsRange
        startTransition(() => {
          setSelected(next)
          router.push(adminAnalyticsHref(next), { scroll: false })
        })
      }}
      className="gap-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList aria-label="Period">
          {ANALYTICS_RANGES.map((value) => (
            <TabsTrigger key={value} value={value} className="px-3">
              {ANALYTICS_RANGE_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>
        {actions}
      </div>
      <TabsContent
        value={selected}
        aria-busy={pending || undefined}
        className={cn("transition-opacity", pending && "opacity-60")}
      >
        {children}
      </TabsContent>
    </Tabs>
  )
}
