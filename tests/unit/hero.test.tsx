import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Hero } from "@/components/home/hero"

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

  it("pairs each trust stat label with its value", () => {
    const { container } = render(<Hero />)

    const pairs = Array.from(container.querySelectorAll("dl > div")).map((row) => [
      row.querySelector("dt")?.textContent,
      row.querySelector("dd")?.textContent,
    ])
    expect(pairs).toEqual([
      ["Happy customers", "50k+"],
      ["Average delivery", "2–4 days"],
      ["Store rating", "4.8/5"],
    ])
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
