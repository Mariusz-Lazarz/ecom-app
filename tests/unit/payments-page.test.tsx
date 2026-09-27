import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { paymentFaqs, paymentMethods } from "@/lib/payments"

// SiteHeader is an async Server Component (reads the session) and has its own tests.
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header /> }))

const { default: PaymentsPage } = await import("@/app/help/payments/page")

function schedule() {
  return within(screen.getByRole("list", { name: "Payment schedule" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent)
}

describe("Payments page", () => {
  it("renders the sections in order under a single h1", () => {
    render(<PaymentsPage />)

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Payment options")
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Ways to pay",
      "Split it into 4, pay no interest.",
      "Your payment is safe with us",
      "Frequently asked questions",
    ])
  })

  it.each(paymentMethods)("shows the $name card with every accepted brand", (method) => {
    render(<PaymentsPage />)

    const card = screen.getByRole("article", { name: method.name })
    expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual(method.brands)
    if (method.badge) expect(within(card).getByText(method.badge)).toBeInTheDocument()
  })

  it("updates the Pay-in-4 schedule as the order total changes", () => {
    render(<PaymentsPage />)

    expect(schedule()).toEqual(["1Today$60.00", "2In 2 weeks$60.00", "3In 4 weeks$60.00", "4In 6 weeks$60.00"])

    fireEvent.change(screen.getByRole("slider", { name: "Order total" }), { target: { value: "1010" } })

    expect(screen.getByRole("status")).toHaveTextContent("$1,010.00")
    expect(schedule()).toEqual([
      "1Today$252.50",
      "2In 2 weeks$252.50",
      "3In 4 weeks$252.50",
      "4In 6 weeks$252.50",
    ])
  })

  it("keeps FAQ answers collapsed until a question is opened", () => {
    render(<PaymentsPage />)

    const groups = screen.getAllByRole("group")
    expect(groups.map((g) => g.querySelector("summary")?.textContent)).toEqual(paymentFaqs.map((f) => f.question))
    expect(groups.every((g) => !(g as HTMLDetailsElement).open)).toBe(true)
  })

  it("only links to internal routes or on-page anchors", () => {
    render(<PaymentsPage />)

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^(\/([a-z0-9-]+(\/[a-z0-9-]+)*)?|#[a-z0-9-]+)$/)
    }
    expect(screen.getByRole("link", { name: /pay-in-4 calculator/i })).toHaveAttribute("href", "#pay-in-4")
    expect(document.getElementById("pay-in-4")).toContainElement(screen.getByRole("slider"))
  })
})
