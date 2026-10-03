import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.fn()

vi.mock("@/auth", () => ({ auth: () => auth() }))

const getCartCount = vi.fn<() => Promise<number>>()
vi.mock("server-only", () => ({}))
vi.mock("@/lib/cart", () => ({ getCartCount: () => getCartCount() }))

const location = { pathname: "/", search: "" }
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
  unstable_rethrow: () => {},
}))

const { SiteHeader } = await import("@/components/site-header")
const { navLinks, siteConfig } = await import("@/lib/data")

describe("SiteHeader", () => {
  beforeEach(() => {
    auth.mockReset().mockResolvedValue(null)
    getCartCount.mockReset().mockResolvedValue(0)
    location.pathname = "/"
    location.search = ""
  })

  it("renders inside the page banner with the promo message", async () => {
    render(await SiteHeader())

    const banner = screen.getByRole("banner")
    expect(within(banner).getByText(/free shipping on orders over \$50/i)).toBeInTheDocument()
    expect(within(banner).getByText(/30-day free returns/i)).toBeInTheDocument()
  })

  it("links the brand logo back to the home page", async () => {
    render(await SiteHeader())

    expect(screen.getByRole("link", { name: siteConfig.name })).toHaveAttribute("href", "/")
  })

  it("renders every primary navigation link in order with its target", async () => {
    render(await SiteHeader())

    // The mobile sheet is closed, so the only <nav> in the DOM is the desktop one.
    const links = within(screen.getByRole("navigation")).getAllByRole("link")
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual(
      navLinks.map((link) => [link.label, link.href])
    )
  })

  it("links the account icon to the sign-in page when signed out", async () => {
    render(await SiteHeader())

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/login")
  })

  it("links the cart icon to /cart with the server-side item count in its name and badge", async () => {
    getCartCount.mockResolvedValue(2)
    render(await SiteHeader())

    const cart = screen.getByRole("link", { name: "Cart, 2 items" })
    expect(cart).toHaveAttribute("href", "/cart")
    expect(within(cart).getByTestId("cart-badge")).toHaveTextContent("2")
    expect(getCartCount).toHaveBeenCalledOnce()
  })

  it("hides the cart badge when the cart is empty", async () => {
    render(await SiteHeader())

    const cart = screen.getByRole("link", { name: "Cart, 0 items" })
    expect(cart).toHaveAttribute("href", "/cart")
    expect(within(cart).queryByTestId("cart-badge")).not.toBeInTheDocument()
  })

  it("still renders, with an empty cart icon, when the count can't be read", async () => {
    getCartCount.mockRejectedValue(new Error("connection refused"))
    render(await SiteHeader())

    expect(screen.getByRole("link", { name: "Cart, 0 items" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: siteConfig.name })).toBeInTheDocument()
  })

  it("links the account icon to the account page when signed in", async () => {
    auth.mockResolvedValue({ user: { email: "jan@example.com" } })
    render(await SiteHeader())

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account")
  })

  it("exposes search as a collapsed toggle button rather than a link", async () => {
    render(await SiteHeader())

    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("link", { name: "Search" })).not.toBeInTheDocument()
    expect(screen.queryByRole("search")).not.toBeInTheDocument()
  })

  it("opens a search form that submits a GET to /products with the term as q", async () => {
    const user = userEvent.setup()
    render(await SiteHeader())

    await user.click(screen.getByRole("button", { name: "Search" }))

    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("aria-expanded", "true")
    const form = screen.getByRole("search")
    expect(form).toHaveAttribute("action", "/products")
    expect(form.getAttribute("method") ?? "get").toMatch(/^get$/i)
    const input = within(form).getByRole("combobox", { name: "Search products" })
    expect(input).toHaveAttribute("name", "q")
    expect(input).toHaveValue("")
    expect(input).toHaveFocus()
    // Away from /products, a search starts from an unfiltered catalogue.
    expect(form.querySelectorAll('input[type="hidden"]')).toHaveLength(0)
  })

  it("keeps the current filters and term when searching from /products", async () => {
    location.pathname = "/products"
    location.search = "q=boots&category=footwear&sort=price-asc&onSale=true&page=3"
    const user = userEvent.setup()
    render(await SiteHeader())

    await user.click(screen.getByRole("button", { name: "Search" }))

    const form = screen.getByRole("search")
    expect(within(form).getByRole("combobox", { name: "Search products" })).toHaveValue("boots")
    const hidden = [...form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((i) => [i.name, i.value])
    // The page is dropped: a new search starts on page 1.
    expect(hidden).toEqual([
      ["category", "footwear"],
      ["sort", "price-asc"],
      ["onSale", "true"],
    ])
  })

  it("closes the search with its close button, the toggle, and Escape", async () => {
    const user = userEvent.setup()
    render(await SiteHeader())
    const toggle = screen.getByRole("button", { name: "Search" })

    await user.click(toggle)
    await user.click(screen.getByRole("button", { name: "Close search" }))
    expect(screen.queryByRole("search")).not.toBeInTheDocument()

    await user.click(toggle)
    await user.click(toggle)
    expect(screen.queryByRole("search")).not.toBeInTheDocument()

    await user.click(toggle)
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("search")).not.toBeInTheDocument()
  })

  it("opens a mobile menu dialog listing all navigation links", async () => {
    const user = userEvent.setup()
    render(await SiteHeader())

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Open menu" }))

    const dialog = await screen.findByRole("dialog", { name: siteConfig.name })
    const mobileLinks = within(dialog).getAllByRole("link")
    expect(mobileLinks.map((link) => link.getAttribute("href"))).toEqual(navLinks.map((l) => l.href))
    expect(mobileLinks.map((link) => link.textContent)).toEqual(navLinks.map((l) => l.label))
  })

  it("closes the mobile menu when a link is chosen", async () => {
    const user = userEvent.setup()
    render(await SiteHeader())

    await user.click(screen.getByRole("button", { name: "Open menu" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("link", { name: "Deals" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("closes the mobile menu with the close button and with Escape", async () => {
    const user = userEvent.setup()
    render(await SiteHeader())

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
