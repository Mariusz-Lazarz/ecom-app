import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { makeProduct } from "./fixtures/products"

const notifySuccess = vi.fn()
vi.mock("@/lib/notify", () => ({ notify: { success: (...args: unknown[]) => notifySuccess(...args) } }))

const addToCart = vi.fn()
vi.mock("@/app/actions/cart", () => ({ addToCart: (...args: unknown[]) => addToCart(...args) }))
vi.mock("@/app/actions/wishlist", () => ({ toggleWishlistItem: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

const { ProductCard } = await import("@/components/products/product-card")

const card = () => screen.getByRole("link", { name: /Product|Aria/ }).closest<HTMLElement>('[data-slot="card"]')!

beforeEach(() => {
  notifySuccess.mockReset()
  addToCart.mockReset().mockResolvedValue({ ok: true, itemCount: 1 })
})

describe("ProductCard", () => {
  it("has no heart unless given the visitor's wishlist", () => {
    render(<ProductCard product={makeProduct({ name: "Aria" })} />)

    expect(within(card()).queryByRole("button", { name: /wishlist/ })).not.toBeInTheDocument()
  })

  it.each([
    ["a guest", null, "Save Aria to wishlist", "false"],
    ["a customer who hasn't saved it", new Set<string>(["id-other"]), "Save Aria to wishlist", "false"],
    ["a customer who saved it", new Set<string>(["id-halden-aria"]), "Remove Aria from wishlist", "true"],
  ])("shows a heart toggle for %s", (_who, wishlist, name, pressed) => {
    render(<ProductCard product={makeProduct({ slug: "halden-aria", name: "Aria" })} wishlist={wishlist} />)

    expect(within(card()).getByRole("button", { name })).toHaveAttribute("aria-pressed", pressed)
  })

  it("announces a single link to the product page, named after the product", () => {
    render(<ProductCard product={makeProduct({ slug: "halden-aria", name: "Aria" })} />)

    const links = within(card()).getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAccessibleName("Aria")
    expect(links[0]).toHaveAttribute("href", "/products/halden-aria")
  })

  it("keeps the photo link clickable but hidden from AT and the tab order", () => {
    render(<ProductCard product={makeProduct({ slug: "halden-aria", name: "Aria" })} />)

    const photoLink = screen.getByAltText("Photo of halden-aria").closest("a")!
    expect(photoLink).toHaveAttribute("href", "/products/halden-aria")
    expect(photoLink).toHaveAttribute("aria-hidden", "true")
    expect(photoLink).toHaveAttribute("tabindex", "-1")
  })

  it("serves the photo through the image optimiser with its stored alt text", () => {
    const product = makeProduct()
    render(<ProductCard product={product} />)

    const src = new URL(screen.getByAltText(product.image!.alt).getAttribute("src")!, "http://localhost")
    expect(src.pathname).toBe("/_next/image")
    expect(src.searchParams.get("url")).toBe(product.image!.url)
  })

  it("shows a placeholder when the product has no image", () => {
    render(<ProductCard product={makeProduct({ image: null })} />)

    expect(within(card()).queryByRole("img")).not.toBeInTheDocument()
    expect(card().querySelector("svg.lucide-image-off")).not.toBeNull()
  })

  it("shows brand, rating with one decimal, and review count", () => {
    render(<ProductCard product={makeProduct({ brand: "Marlowe Audio", rating: 4, reviewCount: 1284 })} />)

    expect(within(card()).getByText("Marlowe Audio")).toBeInTheDocument()
    expect(within(card()).getByText("4.0")).toBeInTheDocument()
    expect(within(card()).getByText(/^\(1284/)).toBeInTheDocument()
  })

  it("says a product without reviews has none yet instead of a 0.0 rating", () => {
    render(<ProductCard product={makeProduct({ rating: 0, reviewCount: 0 })} />)

    expect(within(card()).getByText("No reviews yet")).toBeInTheDocument()
    expect(within(card()).queryByText("0.0")).not.toBeInTheDocument()
  })

  it("shows a regular price without a struck price or red highlight", () => {
    render(<ProductCard product={makeProduct({ priceCents: 14900 })} />)

    const price = within(card()).getByText("$149.00")
    expect(price).not.toHaveClass("text-destructive")
    expect(card().querySelectorAll(".line-through")).toHaveLength(0)
  })

  it("shows a sale price in red next to the struck-through was price", () => {
    render(<ProductCard product={makeProduct({ priceCents: 29900, compareAtCents: 34900, onSale: true })} />)

    expect(within(card()).getByText("$299.00")).toHaveClass("text-destructive")
    const struck = card().querySelectorAll(".line-through")
    expect(struck).toHaveLength(1)
    expect(struck[0]).toHaveTextContent("Was $349.00")
  })

  it("ignores a compare-at price when the product isn't on sale", () => {
    render(<ProductCard product={makeProduct({ priceCents: 14900, compareAtCents: 14900, onSale: false })} />)

    expect(within(card()).getByText("$149.00")).not.toHaveClass("text-destructive")
    expect(card().querySelectorAll(".line-through")).toHaveLength(0)
  })

  it("shows the badge outside the hidden photo link, and none when there is no badge", () => {
    const { unmount } = render(<ProductCard product={makeProduct({ badge: "Bestseller" })} />)
    const badges = card().querySelectorAll('[data-slot="badge"]')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveTextContent("Bestseller")
    expect(badges[0].closest('[aria-hidden="true"]')).toBeNull()
    unmount()

    render(<ProductCard product={makeProduct({ badge: null })} />)
    expect(card().querySelectorAll('[data-slot="badge"]')).toHaveLength(0)
  })

  it("marks an out-of-stock product and disables adding it", () => {
    render(<ProductCard product={makeProduct({ name: "Aria", inStock: false })} />)

    expect(within(card()).getByText("Out of stock")).toBeInTheDocument()
    expect(within(card()).getByRole("button", { name: "Aria is out of stock" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Add Aria to cart" })).not.toBeInTheDocument()
  })

  it("quick-adds one unit of an in-stock product to the cart", async () => {
    const user = userEvent.setup()
    render(<ProductCard product={makeProduct({ id: "id-aria", name: "Aria" })} />)

    expect(within(card()).queryByText("Out of stock")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Add Aria to cart" }))

    expect(addToCart).toHaveBeenCalledExactlyOnceWith({ productId: "id-aria", quantity: 1 })
    expect(notifySuccess).toHaveBeenCalledExactlyOnceWith("Added to cart", expect.objectContaining({ description: "Aria" }))
  })
})
