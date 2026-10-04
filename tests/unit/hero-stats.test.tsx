import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { StoreStats } from "@/lib/store-stats"

const getStoreStats = vi.fn<() => Promise<StoreStats>>()
vi.mock("@/lib/store-stats", () => ({ getStoreStats: () => getStoreStats() }))

const { HeroStats, heroStats } = await import("@/components/home/hero-stats")

const stats = (overrides: Partial<StoreStats> = {}): StoreStats => ({
  happyCustomers: 4,
  averageDeliveryDays: 3.4567,
  rating: 4.3,
  ...overrides,
})

// Async Server Component: resolve it first, then render the element it returns.
const renderStats = async () => render(<>{await HeroStats()}</>)

const pairs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("dl > div")).map((row) => [
    row.querySelector("dt")?.textContent,
    row.querySelector("dd")?.textContent,
  ])

describe("heroStats", () => {
  it("formats every figure the store has data for", () => {
    expect(heroStats(stats())).toEqual([
      { label: "Happy customers", value: "4" },
      { label: "Average delivery", value: "3 days" },
      { label: "Store rating", value: "4.3/5" },
    ])
  })

  it("abbreviates large customer counts", () => {
    expect(heroStats(stats({ happyCustomers: 999 }))[0].value).toBe("999")
    expect(heroStats(stats({ happyCustomers: 1000 }))[0].value).toBe("1K")
    expect(heroStats(stats({ happyCustomers: 52_340 }))[0].value).toBe("52.3K")
  })

  it("rounds the delivery time to whole days, never below one", () => {
    const days = (averageDeliveryDays: number) =>
      heroStats(stats({ averageDeliveryDays }))[1].value
    expect(days(2.7)).toBe("3 days")
    expect(days(2.5)).toBe("3 days")
    expect(days(2.49)).toBe("2 days")
    expect(days(1.49)).toBe("1 day")
    expect(days(0.2)).toBe("1 day")
  })

  it("keeps a whole rating's decimal", () => {
    expect(heroStats(stats({ rating: 5 }))[2]).toEqual({ label: "Store rating", value: "5.0/5" })
  })

  it("leaves out figures without data", () => {
    expect(
      heroStats(stats({ happyCustomers: 0, averageDeliveryDays: null, rating: null }))
    ).toEqual([])
    expect(heroStats(stats({ rating: null })).map((s) => s.label)).toEqual([
      "Happy customers",
      "Average delivery",
    ])
  })
})

describe("HeroStats", () => {
  beforeEach(() => {
    getStoreStats.mockReset()
  })

  it("pairs each label with its live value", async () => {
    getStoreStats.mockResolvedValue(stats())

    const { container } = await renderStats()

    expect(pairs(container)).toEqual([
      ["Happy customers", "4"],
      ["Average delivery", "3 days"],
      ["Store rating", "4.3/5"],
    ])
  })

  it("renders nothing when the store has no figures yet", async () => {
    getStoreStats.mockResolvedValue(
      stats({ happyCustomers: 0, averageDeliveryDays: null, rating: null })
    )

    const { container } = await renderStats()

    expect(container.querySelector("dl")).toBeNull()
  })

  it("renders nothing and logs when the figures can't be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    getStoreStats.mockRejectedValue(new Error("database down"))

    const { container } = await renderStats()

    expect(container.querySelector("dl")).toBeNull()
    error.mockRestore()
  })
})
