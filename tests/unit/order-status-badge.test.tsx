import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ORDER_STATUS_STYLES, OrderStatusBadge } from "@/components/orders/order-status-badge"
import { ORDER_STATUS_LABELS, ORDER_STATUSES } from "@/lib/order-rules"

describe("OrderStatusBadge", () => {
  it.each(ORDER_STATUSES)("labels %s from ORDER_STATUS_LABELS with its own colour", (status) => {
    render(<OrderStatusBadge status={status} />)

    const badge = screen.getByText(ORDER_STATUS_LABELS[status])
    expect(badge).toHaveAttribute("data-status", status)
    for (const cls of ORDER_STATUS_STYLES[status].split(" ")) expect(badge).toHaveClass(cls)
  })

  it("gives every status a different colour", () => {
    const backgrounds = ORDER_STATUSES.map((status) => ORDER_STATUS_STYLES[status].split(" ").find((c) => c.startsWith("bg-")))
    expect(new Set(backgrounds).size).toBe(ORDER_STATUSES.length)
  })

  it("keeps extra classes", () => {
    render(<OrderStatusBadge status="shipped" className="ml-2" />)
    expect(screen.getByText("Shipped")).toHaveClass("ml-2")
  })
})
