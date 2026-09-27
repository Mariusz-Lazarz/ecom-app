import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// SiteHeader is an async Server Component (reads the session) and has its own tests.
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header /> }))

const { default: Home } = await import("@/app/page")

describe("Home page", () => {
  it("is structured as banner → main → contentinfo", () => {
    render(<Home />)

    const banner = screen.getByRole("banner")
    const main = screen.getByRole("main")
    const footer = screen.getByRole("contentinfo")

    expect(banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("renders sections in the intended order under a single h1", () => {
    render(<Home />)

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Shop by category",
      "Featured products",
      "Pay your way, safely.",
      "At your door in days, not weeks.",
      "Get 10% off your first order",
    ])
  })

  it("renders all four Lottie animations", () => {
    render(<Home />)

    expect(
      screen.getAllByTestId("dotlottie").map((player) => player.getAttribute("data-src"))
    ).toEqual([
      "/animations/hero-shopping.lottie",
      "/animations/secure-payment.lottie",
      "/animations/delivery.lottie",
      "/animations/gift.lottie",
    ])
  })

  it("only links to internal routes and never to an empty href", () => {
    render(<Home />)

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^\/([a-z0-9-]+(\/[a-z0-9-]+)*)?$/)
    }
  })

  it("gives every button an accessible name", () => {
    render(<Home />)

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAccessibleName()
    }
  })
})
