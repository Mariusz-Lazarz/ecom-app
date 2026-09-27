import { describe, expect, it } from "vitest"

import { payLater, splitIntoInstalments } from "@/lib/payments"

describe("splitIntoInstalments", () => {
  it("splits an even total into equal payments two weeks apart", () => {
    expect(splitIntoInstalments(240)).toEqual([
      { label: "Today", amount: 60 },
      { label: "In 2 weeks", amount: 60 },
      { label: "In 4 weeks", amount: 60 },
      { label: "In 6 weeks", amount: 60 },
    ])
  })

  it("puts leftover cents on the first payment", () => {
    expect(splitIntoInstalments(100.01).map((i) => i.amount)).toEqual([25.01, 25, 25, 25])
    expect(splitIntoInstalments(0.07).map((i) => i.amount)).toEqual([0.04, 0.01, 0.01, 0.01])
  })

  it.each([payLater.minTotal, 99.99, 333.33, 1234.57, payLater.maxTotal])(
    "always adds back up to the exact total (%s)",
    (total) => {
      const cents = splitIntoInstalments(total).reduce((sum, i) => sum + Math.round(i.amount * 100), 0)
      expect(cents).toBe(Math.round(total * 100))
    }
  )
})
