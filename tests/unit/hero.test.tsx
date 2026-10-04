import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// HeroStats is an async Server Component (reads the database) and has its own tests.
vi.mock("@/components/home/hero-stats", () => ({ HeroStats: () => <dl data-testid="hero-stats" /> }))

const { Hero } = await import("@/components/home/hero")

describe("Hero", () => {
  it("renders the single page-level heading", () => {
    render(<Hero />)

    const headings = screen.getAllByRole("heading", { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent("Shop the things you'll actually love.")
  })

  it("points the primary and secondary calls to action at the shop pages", () => {
    render(<Hero />)

    expect(screen.getByRole("link", { name: /shop now/i })).toHaveAttribute("href", "/products")
    expect(screen.getByRole("link", { name: "Browse categories" })).toHaveAttribute(
      "href",
      "/categories"
    )
  })

  it("shows the store stats under the calls to action", () => {
    render(<Hero />)

    const stats = screen.getByTestId("hero-stats")
    expect(
      screen.getByRole("link", { name: "Browse categories" }).compareDocumentPosition(stats) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("shows the shopping animation with a descriptive label", () => {
    render(<Hero />)

    const animation = screen.getByRole("img", { name: /shopping cart/i })
    expect(within(animation).getByTestId("dotlottie")).toHaveAttribute(
      "data-src",
      "/animations/hero-shopping.lottie"
    )
  })
})
