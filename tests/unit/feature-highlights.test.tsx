import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FeatureHighlights } from "@/components/home/feature-highlights"

function highlightBlock(title: string) {
  // Heading → text column → two-column row
  return screen.getByRole("heading", { level: 2, name: title }).parentElement!.parentElement!
}

const cases = [
  {
    title: "Pay your way, safely.",
    animation: "/animations/secure-payment.lottie",
    animationLabel: /secure mobile payment/i,
    link: ["Payment options", "/help/payments"],
    points: ["256-bit SSL encryption", "Cards, wallets & pay later", "Buyer protection on every order"],
  },
  {
    title: "At your door in days, not weeks.",
    animation: "/animations/delivery.lottie",
    animationLabel: /delivery van/i,
    link: ["Shipping details", "/help/shipping"],
    points: ["Free shipping over $50", "Same-day dispatch before 2 pm", "30-day hassle-free returns"],
  },
]

describe("FeatureHighlights", () => {
  it("renders the payment and delivery highlights in that order", () => {
    render(<FeatureHighlights />)

    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(
      cases.map((c) => c.title)
    )
  })

  it.each(cases)("pairs '$title' with its own animation", ({ title, animation, animationLabel }) => {
    render(<FeatureHighlights />)

    const block = highlightBlock(title)
    const player = within(within(block).getByRole("img", { name: animationLabel })).getByTestId(
      "dotlottie"
    )
    expect(player).toHaveAttribute("data-src", animation)
  })

  it.each(cases)("lists the selling points for '$title'", ({ title, points }) => {
    render(<FeatureHighlights />)

    const items = within(within(highlightBlock(title)).getByRole("list")).getAllByRole("listitem")
    expect(items.map((item) => item.textContent)).toEqual(points)
  })

  it.each(cases)("links '$title' to the matching help page", ({ title, link: [label, href] }) => {
    render(<FeatureHighlights />)

    expect(within(highlightBlock(title)).getByRole("link", { name: new RegExp(label) })).toHaveAttribute(
      "href",
      href
    )
  })

  it("alternates the layout so the delivery animation sits on the other side", () => {
    render(<FeatureHighlights />)

    const [payment, delivery] = screen.getAllByRole("img")
    expect(payment).not.toHaveClass("lg:order-last")
    expect(delivery).toHaveClass("lg:order-last")
  })
})
