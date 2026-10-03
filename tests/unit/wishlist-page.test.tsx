import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { WishlistItem } from "@/lib/wishlist"

const requireUser = vi.fn()
const listWishlist = vi.fn()
const actions = vi.hoisted(() => ({
  moveWishlistItemToCart: vi.fn(),
  removeWishlistItem: vi.fn(),
  addAllWishlistToCart: vi.fn(),
}))
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth-guards", () => ({ requireUser: (path: string) => requireUser(path) }))
vi.mock("@/lib/wishlist", () => ({ listWishlist: (...args: unknown[]) => listWishlist(...args) }))
vi.mock("@/app/actions/wishlist", () => actions)
vi.mock("@/lib/notify", () => ({ notify }))
// SiteHeader is an async Server Component (reads the session) and has its own tests.
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header /> }))

const { default: AccountWishlistPage } = await import("@/app/account/wishlist/page")

let next = 0
function makeItem(overrides: Partial<WishlistItem> = {}): WishlistItem {
  next += 1
  const slug = overrides.slug ?? `saved-${next}`
  return {
    productId: `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`,
    slug,
    name: `Saved ${next}`,
    brand: "Testco",
    image: { url: `https://media.example.com/${slug}.webp`, width: 800, height: 800, alt: `Photo of ${slug}` },
    priceCents: 4900,
    compareAtCents: null,
    onSale: false,
    currency: "USD",
    stock: 20,
    inStock: true,
    addedAt: new Date("2026-09-01T10:00:00Z"),
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => (resolve = res))
  return { promise, resolve }
}

async function renderPage() {
  return render(await AccountWishlistPage())
}

const cardOf = (name: string) => screen.getByRole("link", { name }).closest<HTMLElement>('[data-slot="card"]')!

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue({ user: { id: "user-1" } })
  listWishlist.mockReset().mockResolvedValue([])
  for (const fn of [...Object.values(actions), ...Object.values(notify)]) fn.mockReset()
})

describe("/account/wishlist", () => {
  it("requires a signed-in user and comes back here after login", async () => {
    await renderPage()

    expect(requireUser).toHaveBeenCalledExactlyOnceWith("/account/wishlist")
    expect(listWishlist).toHaveBeenCalledExactlyOnceWith("user-1")
  })

  it("shows an empty state linking to the catalogue", async () => {
    await renderPage()

    expect(screen.getByRole("heading", { level: 1, name: "Your wishlist" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Your wishlist is empty" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Browse products" })).toHaveAttribute("href", "/products")
    expect(screen.queryByRole("button", { name: /add all/i })).not.toBeInTheDocument()
  })

  it("lists the saved products with live price, sale and stock", async () => {
    listWishlist.mockResolvedValue([
      makeItem({ name: "Aria", slug: "aria", priceCents: 7900, compareAtCents: 9900, onSale: true }),
      makeItem({ name: "Pulse", slug: "pulse", stock: 3 }),
      makeItem({ name: "Tern", slug: "tern", stock: 0, inStock: false }),
    ])
    await renderPage()

    expect(screen.getByRole("status")).toHaveTextContent("3 saved items · 1 out of stock")
    expect(screen.getByRole("link", { name: "Aria" })).toHaveAttribute("href", "/products/aria")
    expect(within(cardOf("Aria")).getByText("$79.00")).toBeInTheDocument()
    expect(within(cardOf("Aria")).getByText("$99.00")).toBeInTheDocument()
    expect(within(cardOf("Pulse")).getByText("Only 3 left")).toBeInTheDocument()

    const tern = within(cardOf("Tern"))
    expect(tern.getAllByText("Out of stock")).toHaveLength(2) // badge and disabled button
    expect(tern.getByRole("button", { name: "Out of stock" })).toBeDisabled()
    expect(tern.getByRole("button", { name: "Remove Tern from wishlist" })).toBeEnabled()
    expect(within(cardOf("Aria")).getByRole("button", { name: "Move to cart" })).toBeEnabled()
  })

  it("disables Add all when nothing is in stock", async () => {
    listWishlist.mockResolvedValue([makeItem({ stock: 0, inStock: false })])
    await renderPage()

    expect(screen.getByRole("button", { name: "Add all available to cart" })).toBeDisabled()
  })

  it("moves an item to the cart: hides it at once and confirms with a View cart toast", async () => {
    const aria = makeItem({ name: "Aria" })
    listWishlist.mockResolvedValue([aria, makeItem({ name: "Pulse" })])
    const call = deferred<{ ok: boolean; cartCount: number }>()
    actions.moveWishlistItemToCart.mockReturnValue(call.promise)
    const user = userEvent.setup()
    await renderPage()

    await user.click(within(cardOf("Aria")).getByRole("button", { name: "Move to cart" }))

    expect(actions.moveWishlistItemToCart).toHaveBeenCalledExactlyOnceWith({ productId: aria.productId })
    expect(screen.queryByRole("link", { name: "Aria" })).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("1 saved item")

    call.resolve({ ok: true, cartCount: 1 })
    await waitFor(() => expect(notify.success).toHaveBeenCalledOnce())
    expect(notify.success).toHaveBeenCalledWith("Moved to cart", {
      description: "Aria",
      action: { label: "View cart", onClick: expect.any(Function) },
    })
  })

  it("shows the cart's note as a warning when the move was capped", async () => {
    listWishlist.mockResolvedValue([makeItem({ name: "Aria" })])
    actions.moveWishlistItemToCart.mockResolvedValue({ ok: true, message: "Only 2 available and they're all in your cart already." })
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("button", { name: "Move to cart" }))

    await waitFor(() => expect(notify.warning).toHaveBeenCalledOnce())
    expect(notify.warning).toHaveBeenCalledWith("Only 2 available and they're all in your cart already.", {
      description: "Aria",
      action: { label: "View cart", onClick: expect.any(Function) },
    })
    expect(notify.success).not.toHaveBeenCalled()
  })

  it("puts the item back with the cart's error when the move fails", async () => {
    listWishlist.mockResolvedValue([makeItem({ name: "Aria" })])
    actions.moveWishlistItemToCart.mockResolvedValue({ ok: false, saved: true, message: "This product is out of stock." })
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("button", { name: "Move to cart" }))

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith("Couldn't move to cart", { description: "This product is out of stock." }),
    )
    expect(await screen.findByRole("link", { name: "Aria" })).toBeInTheDocument()
  })

  it("removes an item, and puts it back when the action throws", async () => {
    const aria = makeItem({ name: "Aria" })
    listWishlist.mockResolvedValue([aria])
    actions.removeWishlistItem.mockRejectedValue(new Error("network down"))
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("button", { name: "Remove Aria from wishlist" }))

    expect(actions.removeWishlistItem).toHaveBeenCalledExactlyOnceWith({ productId: aria.productId })
    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith("Couldn't remove this item", {
        description: "Something went wrong. Please try again.",
      }),
    )
    expect(await screen.findByRole("link", { name: "Aria" })).toBeInTheDocument()
  })

  it("adds all available items and reports what was skipped", async () => {
    listWishlist.mockResolvedValue([makeItem(), makeItem(), makeItem({ stock: 0, inStock: false })])
    actions.addAllWishlistToCart.mockResolvedValue({ ok: true, added: 2, skipped: 1, cartCount: 2 })
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("button", { name: "Add all available to cart" }))

    await waitFor(() => expect(notify.success).toHaveBeenCalledOnce())
    expect(notify.success).toHaveBeenCalledWith("2 items added to cart", {
      description: "1 out of stock was skipped.",
      action: { label: "View cart", onClick: expect.any(Function) },
    })
  })

  it("shows the error when adding all fails", async () => {
    listWishlist.mockResolvedValue([makeItem()])
    actions.addAllWishlistToCart.mockResolvedValue({ ok: false, message: "None of your saved items are in stock right now." })
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("button", { name: "Add all available to cart" }))

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith("Couldn't add to cart", {
        description: "None of your saved items are in stock right now.",
      }),
    )
  })
})
