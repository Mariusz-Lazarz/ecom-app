import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { shippingFaqs, shippingMethods, shippingZones } from "@/lib/shipping"

// SiteHeader is an async Server Component (reads the session) and has its own tests.
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header /> }))

const { default: ShippingPage } = await import("@/app/help/shipping/page")

function estimate() {
  return screen.getAllByRole("definition").map((dd) => dd.textContent)
}

describe("Shipping page", () => {
  it("renders the sections in order under a single h1", () => {
    render(<ShippingPage />)

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Shipping & delivery")
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Delivery options",
      "Free shipping over $50.",
      "From our warehouse to your door",
      "Where we ship",
      "Frequently asked questions",
    ])
  })

  it.each(shippingMethods)("shows the $name card with its price, window and badge", (method) => {
    render(<ShippingPage />)

    const card = screen.getByRole("article", { name: method.name })
    expect(within(card).getByText(method.description)).toBeInTheDocument()
    if (method.badge) expect(within(card).getByText(method.badge)).toBeInTheDocument()
  })

  it("shows price and delivery window badges on the method cards", () => {
    render(<ShippingPage />)

    expect(within(screen.getByRole("article", { name: "Standard" })).getByText("$5.99")).toBeInTheDocument()
    expect(within(screen.getByRole("article", { name: "Standard" })).getByText("3–5 business days")).toBeInTheDocument()
    expect(within(screen.getByRole("article", { name: "Next day" })).getByText("1 business day")).toBeInTheDocument()
    expect(within(screen.getByRole("article", { name: "Parcel locker pickup" })).getByText("Free")).toBeInTheDocument()
  })

  it("updates the estimate as the subtotal and method change", () => {
    render(<ShippingPage />)

    const progress = screen.getByRole("progressbar", { name: "Progress to free shipping" })
    expect(estimate()).toEqual(["$5.99", "3–5 business days"])
    expect(progress).toHaveAttribute("value", "35")
    expect(screen.getByText("Add $15.00 more for free standard shipping.")).toBeInTheDocument()

    fireEvent.change(screen.getByRole("slider", { name: "Order subtotal" }), { target: { value: "50" } })

    expect(screen.getByRole("status")).toHaveTextContent("$50.00")
    expect(estimate()).toEqual(["Free", "3–5 business days"])
    expect(progress).toHaveAttribute("value", "50")
    expect(screen.getByText("You've unlocked free standard shipping.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("radio", { name: "Next day" }))

    expect(screen.getByRole("radio", { name: "Next day" })).toBeChecked()
    expect(estimate()).toEqual(["$19.99", "1 business day"])
  })

  it("caps the free-shipping progress at the threshold", () => {
    render(<ShippingPage />)

    fireEvent.change(screen.getByRole("slider", { name: "Order subtotal" }), { target: { value: "150" } })

    expect(screen.getByRole("progressbar", { name: "Progress to free shipping" })).toHaveAttribute("value", "50")
  })

  it("lists every shipping zone in the table", () => {
    render(<ShippingPage />)

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1)
    expect(rows.map((row) => Array.from(row.children, (c) => c.textContent))).toEqual(
      shippingZones.map((z) => [z.region, z.time, z.price])
    )
  })

  it("keeps FAQ answers collapsed until a question is opened", () => {
    render(<ShippingPage />)

    const groups = screen.getAllByRole("group").filter((g) => g.tagName === "DETAILS")
    expect(groups.map((g) => g.querySelector("summary")?.textContent)).toEqual(shippingFaqs.map((f) => f.question))
    expect(groups.every((g) => !(g as HTMLDetailsElement).open)).toBe(true)
  })

  it("only links to internal routes or on-page anchors", () => {
    render(<ShippingPage />)

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^(\/([a-z0-9-]+(\/[a-z0-9-]+)*)?|#[a-z0-9-]+)$/)
    }
    expect(screen.getByRole("link", { name: /estimate your shipping/i })).toHaveAttribute("href", "#estimate")
    expect(document.getElementById("estimate")).toContainElement(screen.getByRole("slider"))
  })
})
