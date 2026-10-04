import { formatPrice } from "@/lib/catalogue"
import type { OrderStatus } from "@/lib/order-rules"

// Pure helpers for the admin analytics page and the dashboard's revenue card. Client-safe.
// Every period is a half-open range of whole UTC days: `from` inclusive, `to` exclusive.

export const ADMIN_ANALYTICS_PATH = "/admin/analytics"
export const ORDERS_EXPORT_PATH = "/api/admin/orders/export"

export const ANALYTICS_RANGES = ["7d", "30d", "90d", "all"] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = "30d"

export const ANALYTICS_RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
}

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 }

export const DAY_MS = 24 * 60 * 60 * 1000

/** A range of whole UTC days, `from` inclusive and `to` exclusive. */
export type DayRange = { from: Date; to: Date }
/** What to report on: `from` null means "since the first order". */
export type AnalyticsPeriod = { from: Date | null; to: Date }

/** Reads `?range=`; anything other than a known preset falls back to 30 days. */
export function parseAnalyticsRange(value: string | string[] | undefined): AnalyticsRange {
  const first = Array.isArray(value) ? value[0] : value
  return (ANALYTICS_RANGES as readonly string[]).includes(first ?? "") ? (first as AnalyticsRange) : DEFAULT_ANALYTICS_RANGE
}

export const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

export const addUtcDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS)

/** `YYYY-MM-DD` of the UTC day the instant falls on. */
export const utcDayKey = (date: Date) => date.toISOString().slice(0, 10)

/** Whole days in a range. */
export const dayCount = (range: DayRange) => Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS)

/** The last `days` UTC days including today: `to` is the start of tomorrow. */
export function recentDays(days: number, now = new Date()): DayRange {
  const to = addUtcDays(startOfUtcDay(now), 1)
  return { from: addUtcDays(to, -days), to }
}

/** The period a preset covers at `now`: the last N UTC days, or everything up to the end of today. */
export function analyticsPeriod(range: AnalyticsRange, now = new Date()): AnalyticsPeriod {
  return range === "all" ? { from: null, to: recentDays(1, now).to } : recentDays(RANGE_DAYS[range], now)
}

/** The period of the same length just before `range`. */
export function previousRange(range: DayRange): DayRange {
  return { from: addUtcDays(range.from, -dayCount(range)), to: range.from }
}

/** Every UTC day of the range in order, with the matching row's values or zeros. */
export function fillDailySeries<V extends object>(
  rows: readonly (V & { date: string })[],
  range: DayRange,
  empty: V,
): (V & { date: string })[] {
  const byDate = new Map(rows.map((row) => [row.date, row]))
  const days: (V & { date: string })[] = []
  for (let day = range.from; day < range.to; day = addUtcDays(day, 1)) {
    const key = utcDayKey(day)
    days.push(byDate.get(key) ?? { ...empty, date: key })
  }
  return days
}

export type Delta =
  | { direction: "up" | "down"; percent: number }
  | { direction: "flat"; percent: 0 }
  // Up from nothing: no meaningful percentage.
  | { direction: "new"; percent: null }

/** How `current` compares with `previous`, as a percentage of `previous` rounded to one decimal. */
export function compareValues(current: number, previous: number): Delta {
  if (current === previous) return { direction: "flat", percent: 0 }
  // The values compared (money, counts) are never negative.
  if (previous === 0) return { direction: "new", percent: null }
  const percent = Math.round((Math.abs(current - previous) / Math.abs(previous)) * 1000) / 10
  if (percent === 0) return { direction: "flat", percent: 0 }
  return { direction: current > previous ? "up" : "down", percent }
}

const percentFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

/** The delta as short text: `+12.5%`, `−3%` (a real minus sign), `0%` or `New`. */
export function formatDelta(delta: Delta): string {
  switch (delta.direction) {
    case "up":
      return `+${percentFormat.format(delta.percent)}%`
    case "down":
      return `−${percentFormat.format(delta.percent)}%`
    case "flat":
      return "0%"
    case "new":
      return "New"
  }
}

/** The delta in words for screen readers: "up 12.5%", "down 3%", "no change", "up from zero". */
export function describeDelta(delta: Delta): string {
  switch (delta.direction) {
    case "up":
      return `up ${percentFormat.format(delta.percent)}%`
    case "down":
      return `down ${percentFormat.format(delta.percent)}%`
    case "flat":
      return "no change"
    case "new":
      return "up from zero"
  }
}

/** A link to the analytics page for a range (the default is left out). */
export function adminAnalyticsHref(range: AnalyticsRange = DEFAULT_ANALYTICS_RANGE) {
  return range === DEFAULT_ANALYTICS_RANGE ? ADMIN_ANALYTICS_PATH : `${ADMIN_ANALYTICS_PATH}?range=${range}`
}

export type OrdersExportFilters = {
  status?: OrderStatus
  q?: string
  // Whole UTC days, both inclusive (`YYYY-MM-DD`).
  from?: string
  to?: string
}

/** The orders CSV download for these filters. */
export function ordersExportHref(filters: OrdersExportFilters = {}) {
  const params = new URLSearchParams()
  if (filters.status) params.set("status", filters.status)
  if (filters.q) params.set("q", filters.q)
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  const search = params.toString()
  return search ? `${ORDERS_EXPORT_PATH}?${search}` : ORDERS_EXPORT_PATH
}

/** A day range as the export's inclusive `from` / `to` days. */
export const exportDays = (range: DayRange) => ({
  from: utcDayKey(range.from),
  to: utcDayKey(addUtcDays(range.to, -1)),
})

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const longDayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

/** `2026-10-04` → "Oct 4" (axis ticks), or "Oct 4, 2026" with `long`. */
export function formatDay(key: string, long = false) {
  const date = new Date(`${key}T00:00:00Z`)
  return (long ? longDayFormat : dayFormat).format(date)
}

/** "Sep 5 – Oct 4, 2026": the days a range covers. */
export function formatDayRange(range: DayRange) {
  const last = utcDayKey(addUtcDays(range.to, -1))
  const first = utcDayKey(range.from)
  return first === last ? formatDay(first, true) : `${formatDay(first, first.slice(0, 4) !== last.slice(0, 4))} – ${formatDay(last, true)}`
}

export type DailyPoint = { date: string; revenueCents: number; orders: number }

/**
 * One sentence describing a daily series for screen readers and the chart's caption: the total,
 * the busiest day, and how many days had none.
 */
export function summarizeDaily(
  points: readonly DailyPoint[],
  measure: "revenue" | "orders",
  currency = "USD",
): string {
  const value = (point: DailyPoint) => (measure === "revenue" ? point.revenueCents : point.orders)
  const format = (n: number) => (measure === "revenue" ? formatPrice(n, currency) : `${n} ${n === 1 ? "order" : "orders"}`)
  const total = points.reduce((sum, point) => sum + value(point), 0)
  const days = `${points.length} ${points.length === 1 ? "day" : "days"}`
  if (total === 0) return `No ${measure} ${points.length === 1 ? "on this day" : `in these ${days}`}.`
  const best = points.reduce((top, point) => (value(point) > value(top) ? point : top))
  const quiet = points.filter((point) => value(point) === 0).length
  return (
    `${format(total)} over ${days}. Best day: ${formatDay(best.date, true)} with ${format(value(best))}.` +
    (quiet > 0 ? ` ${quiet} ${quiet === 1 ? "day" : "days"} without ${measure === "revenue" ? "revenue" : "orders"}.` : "")
  )
}

/** Cents as whole dollars for chart axes: "$1.2K", "$950". */
export function formatCompactMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100)
}
