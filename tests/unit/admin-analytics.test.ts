import { describe, expect, it } from "vitest"

import {
  adminAnalyticsHref,
  analyticsPeriod,
  compareValues,
  dayCount,
  describeDelta,
  exportDays,
  fillDailySeries,
  formatCompactMoney,
  formatDayRange,
  formatDelta,
  ordersExportHref,
  parseAnalyticsRange,
  previousRange,
  recentDays,
  summarizeDaily,
} from "@/lib/admin-analytics"

const day = (date: string) => new Date(`${date}T00:00:00Z`)

describe("parseAnalyticsRange", () => {
  it.each(["7d", "30d", "90d", "all"] as const)("accepts %s", (range) => {
    expect(parseAnalyticsRange(range)).toBe(range)
  })

  it.each([undefined, "", "14d", "ALL", " 7d"])("falls back to 30 days for %j", (value) => {
    expect(parseAnalyticsRange(value)).toBe("30d")
  })

  it("uses the first value of a repeated param", () => {
    expect(parseAnalyticsRange(["90d", "7d"])).toBe("90d")
    expect(parseAnalyticsRange([])).toBe("30d")
  })
})

describe("analyticsPeriod", () => {
  const now = new Date("2026-10-04T15:30:00Z")

  it("covers the last N UTC days including today", () => {
    expect(analyticsPeriod("7d", now)).toEqual({ from: day("2026-09-28"), to: day("2026-10-05") })
    expect(analyticsPeriod("30d", now)).toEqual({ from: day("2026-09-05"), to: day("2026-10-05") })
    expect(analyticsPeriod("90d", now)).toEqual({ from: day("2026-07-07"), to: day("2026-10-05") })
  })

  it("has no start for all time", () => {
    expect(analyticsPeriod("all", now)).toEqual({ from: null, to: day("2026-10-05") })
  })

  it("buckets by UTC day at the edges of a day", () => {
    expect(analyticsPeriod("7d", new Date("2026-10-04T00:00:00Z")).to).toEqual(day("2026-10-05"))
    expect(analyticsPeriod("7d", new Date("2026-10-04T23:59:59.999Z")).to).toEqual(day("2026-10-05"))
    // 01:30 in Warsaw on Oct 5 is still Oct 4 in UTC.
    expect(analyticsPeriod("7d", new Date("2026-10-05T01:30:00+02:00")).to).toEqual(day("2026-10-05"))
  })

  it("crosses month and year boundaries", () => {
    expect(recentDays(3, new Date("2027-01-01T08:00:00Z"))).toEqual({ from: day("2026-12-30"), to: day("2027-01-02") })
  })
})

describe("previousRange and dayCount", () => {
  it("is the range of equal length just before", () => {
    const range = { from: day("2026-09-28"), to: day("2026-10-05") }
    expect(dayCount(range)).toBe(7)
    expect(previousRange(range)).toEqual({ from: day("2026-09-21"), to: day("2026-09-28") })
  })

  it("handles a single day", () => {
    expect(previousRange({ from: day("2026-03-01"), to: day("2026-03-02") })).toEqual({
      from: day("2026-02-28"),
      to: day("2026-03-01"),
    })
  })
})

describe("fillDailySeries", () => {
  const range = { from: day("2026-09-30"), to: day("2026-10-03") }
  const empty = { revenueCents: 0, orders: 0 }

  it("has one entry per day in order, filling the gaps with zeros", () => {
    const rows = [
      { date: "2026-10-02", revenueCents: 500, orders: 1 },
      { date: "2026-09-30", revenueCents: 1200, orders: 2 },
    ]
    expect(fillDailySeries(rows, range, empty)).toEqual([
      { date: "2026-09-30", revenueCents: 1200, orders: 2 },
      { date: "2026-10-01", revenueCents: 0, orders: 0 },
      { date: "2026-10-02", revenueCents: 500, orders: 1 },
    ])
  })

  it("is all zeros without rows and empty for an empty range", () => {
    expect(fillDailySeries([], range, empty).map((point) => point.orders)).toEqual([0, 0, 0])
    expect(fillDailySeries([], { from: range.from, to: range.from }, empty)).toEqual([])
  })

  it("ignores rows outside the range", () => {
    expect(fillDailySeries([{ date: "2026-10-03", revenueCents: 9, orders: 1 }], range, empty)).toHaveLength(3)
    expect(
      fillDailySeries([{ date: "2026-10-03", revenueCents: 9, orders: 1 }], range, empty).some(
        (point) => point.revenueCents > 0,
      ),
    ).toBe(false)
  })
})

describe("compareValues, formatDelta and describeDelta", () => {
  it.each([
    [150, 100, { direction: "up", percent: 50 }, "+50%", "up 50%"],
    [75, 100, { direction: "down", percent: 25 }, "−25%", "down 25%"],
    [0, 100, { direction: "down", percent: 100 }, "−100%", "down 100%"],
    [100, 100, { direction: "flat", percent: 0 }, "0%", "no change"],
    [0, 0, { direction: "flat", percent: 0 }, "0%", "no change"],
    [500, 0, { direction: "new", percent: null }, "New", "up from zero"],
    [1, 3, { direction: "down", percent: 66.7 }, "−66.7%", "down 66.7%"],
    [10001, 10000, { direction: "flat", percent: 0 }, "0%", "no change"],
    [1010, 1000, { direction: "up", percent: 1 }, "+1%", "up 1%"],
    [3000, 1000, { direction: "up", percent: 200 }, "+200%", "up 200%"],
  ] as const)("%d against %d", (current, previous, delta, text, words) => {
    const result = compareValues(current, previous)
    expect(result).toEqual(delta)
    expect(formatDelta(result)).toBe(text)
    expect(describeDelta(result)).toBe(words)
  })
})

describe("links", () => {
  it("leaves the default range out of the analytics link", () => {
    expect(adminAnalyticsHref()).toBe("/admin/analytics")
    expect(adminAnalyticsHref("30d")).toBe("/admin/analytics")
    expect(adminAnalyticsHref("all")).toBe("/admin/analytics?range=all")
  })

  it("builds the export link from the filters given", () => {
    expect(ordersExportHref()).toBe("/api/admin/orders/export")
    expect(ordersExportHref({ status: "delivered", q: "a&b c", from: "2026-09-01", to: "2026-09-30" })).toBe(
      "/api/admin/orders/export?status=delivered&q=a%26b+c&from=2026-09-01&to=2026-09-30",
    )
    expect(ordersExportHref({ q: "" })).toBe("/api/admin/orders/export")
  })

  it("turns a range into the export's inclusive days", () => {
    expect(exportDays({ from: day("2026-09-05"), to: day("2026-10-05") })).toEqual({ from: "2026-09-05", to: "2026-10-04" })
  })
})

describe("formatting", () => {
  it("formats day ranges", () => {
    expect(formatDayRange({ from: day("2026-09-05"), to: day("2026-10-05") })).toBe("Sep 5 – Oct 4, 2026")
    expect(formatDayRange({ from: day("2025-12-30"), to: day("2026-01-03") })).toBe("Dec 30, 2025 – Jan 2, 2026")
    expect(formatDayRange({ from: day("2026-10-04"), to: day("2026-10-05") })).toBe("Oct 4, 2026")
  })

  it("formats axis money compactly", () => {
    expect(formatCompactMoney(0)).toBe("$0")
    expect(formatCompactMoney(95000)).toBe("$950")
    expect(formatCompactMoney(123456)).toBe("$1.2K")
  })
})

describe("summarizeDaily", () => {
  const points = [
    { date: "2026-10-02", revenueCents: 12000, orders: 2 },
    { date: "2026-10-03", revenueCents: 0, orders: 0 },
    { date: "2026-10-04", revenueCents: 3000, orders: 1 },
  ]

  it("names the total, the best day and the quiet days", () => {
    expect(summarizeDaily(points, "revenue")).toBe(
      "$150.00 over 3 days. Best day: Oct 2, 2026 with $120.00. 1 day without revenue.",
    )
    expect(summarizeDaily(points, "orders")).toBe(
      "3 orders over 3 days. Best day: Oct 2, 2026 with 2 orders. 1 day without orders.",
    )
  })

  it("keeps the first of equally good days and leaves out quiet days when there are none", () => {
    expect(summarizeDaily([points[2], { ...points[2], date: "2026-10-05" }], "orders")).toBe(
      "2 orders over 2 days. Best day: Oct 4, 2026 with 1 order.",
    )
  })

  it("says so when there's nothing", () => {
    expect(summarizeDaily([{ ...points[1] }], "revenue")).toBe("No revenue on this day.")
    expect(summarizeDaily([], "orders")).toBe("No orders in these 0 days.")
  })
})
