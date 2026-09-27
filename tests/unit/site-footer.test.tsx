import { render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SiteFooter } from "@/components/site-footer"
import { categories, siteConfig } from "@/lib/data"

function linksUnder(heading: string) {
  const column = screen.getByRole("heading", { name: heading }).parentElement!
  return within(column)
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")])
}

describe("SiteFooter", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("is the page's contentinfo landmark with the brand and tagline", () => {
    render(<SiteFooter />)

    const footer = screen.getByRole("contentinfo")
    expect(within(footer).getByRole("link", { name: siteConfig.name })).toHaveAttribute("href", "/")
    expect(within(footer).getByText(siteConfig.tagline)).toBeInTheDocument()
  })

  it("builds the Shop column from the first four categories", () => {
    render(<SiteFooter />)

    expect(linksUnder("Shop")).toEqual(
      categories.slice(0, 4).map((c) => [c.name, `/categories/${c.slug}`])
    )
  })

  it("links help and company pages to their routes", () => {
    render(<SiteFooter />)

    expect(linksUnder("Help")).toEqual([
      ["Shipping", "/help/shipping"],
      ["Returns", "/help/returns"],
      ["Payments", "/help/payments"],
      ["Contact us", "/help/contact"],
    ])
    expect(linksUnder("Company")).toEqual([
      ["About", "/about"],
      ["Careers", "/careers"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ])
  })

  it("stamps the copyright with the current year", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2031-03-15T12:00:00Z"))

    render(<SiteFooter />)

    expect(screen.getByText(`© 2031 ${siteConfig.name}. All rights reserved.`)).toBeInTheDocument()
  })

  it("credits the animation and photo sources", () => {
    render(<SiteFooter />)

    expect(screen.getByText(/lottiefiles/i)).toBeInTheDocument()
    expect(screen.getByText(/unsplash/i)).toBeInTheDocument()
  })
})
