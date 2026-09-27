import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { SiteHeader } from "@/components/site-header"
import { navLinks, siteConfig } from "@/lib/data"

describe("SiteHeader", () => {
  it("renders inside the page banner with the promo message", () => {
    render(<SiteHeader />)

    const banner = screen.getByRole("banner")
    expect(within(banner).getByText(/free shipping on orders over \$50/i)).toBeInTheDocument()
    expect(within(banner).getByText(/30-day free returns/i)).toBeInTheDocument()
  })

  it("links the brand logo back to the home page", () => {
    render(<SiteHeader />)

    expect(screen.getByRole("link", { name: siteConfig.name })).toHaveAttribute("href", "/")
  })

  it("renders every primary navigation link in order with its target", () => {
    render(<SiteHeader />)

    // The mobile sheet is closed, so the only <nav> in the DOM is the desktop one.
    const links = within(screen.getByRole("navigation")).getAllByRole("link")
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual(
      navLinks.map((link) => [link.label, link.href])
    )
  })

  it("links account and cart icons to their pages with accessible names", () => {
    render(<SiteHeader />)

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/login")

    const cart = screen.getByRole("link", { name: "Cart, 2 items" })
    expect(cart).toHaveAttribute("href", "/cart")
    expect(cart).toHaveTextContent("2")
  })

  it("exposes search as a real button rather than a link", () => {
    render(<SiteHeader />)

    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Search" })).not.toBeInTheDocument()
  })

  it("opens a mobile menu dialog listing all navigation links", async () => {
    const user = userEvent.setup()
    render(<SiteHeader />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Open menu" }))

    const dialog = await screen.findByRole("dialog", { name: siteConfig.name })
    const mobileLinks = within(dialog).getAllByRole("link")
    expect(mobileLinks.map((link) => link.getAttribute("href"))).toEqual(navLinks.map((l) => l.href))
    expect(mobileLinks.map((link) => link.textContent)).toEqual(navLinks.map((l) => l.label))
  })

  it("closes the mobile menu with the close button and with Escape", async () => {
    const user = userEvent.setup()
    render(<SiteHeader />)

    await user.click(screen.getByRole("button", { name: "Open menu" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: "Open menu" }))
    await screen.findByRole("dialog")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })
})
