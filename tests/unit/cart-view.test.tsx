import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CartActionResult } from "@/app/actions/cart"

import { makeCart, makeCartItem } from "./fixtures/cart"

const updateCartItem = vi.fn<(input: { productId: string; quantity: number }) => Promise<CartActionResult>>()
const removeCartItem = vi.fn<(input: { productId: string }) => Promise<CartActionResult>>()
const clearCart = vi.fn<() => Promise<CartActionResult>>()
vi.mock("@/app/actions/cart", () => ({
  updateCartItem: (input: { productId: string; quantity: number }) => updateCartItem(input),
  removeCartItem: (input: { productId: string }) => removeCartItem(input),
  clearCart: () => clearCart(),
}))

const notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }
vi.mock("@/lib/notify", () => ({ notify }))

const { CartView } = await import("@/components/cart/cart-view")

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const summary = () => document.querySelector<HTMLElement>('dl[aria-label="Order summary"]')!
const row = (label: string) => within(summary()).getByText(label).nextElementSibling!
const line = (name: string) => screen.getByRole("link", { name }).closest("li")!

beforeEach(() => {
  for (const fn of [updateCartItem, removeCartItem, clearCart, ...Object.values(notify)]) fn.mockReset()
})

describe("CartView", () => {
  it("shows the empty state with a link to the products", () => {
    render(<CartView cart={makeCart([])} />)

    expect(screen.getByText("Your cart is empty")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Browse products" })).toHaveAttribute("href", "/products")
    expect(screen.queryByText("Order summary")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Clear cart" })).not.toBeInTheDocument()
  })

  it("lists each line with brand, product link, unit price, quantity and line total", () => {
    const item = makeCartItem({ name: "Aria", slug: "aria", brand: "Halden", priceCents: 29900, compareAtCents: 34900, onSale: true, quantity: 2 })
    render(<CartView cart={makeCart([item])} />)

    const li = line("Aria")
    expect(within(li).getByRole("link", { name: "Aria" })).toHaveAttribute("href", "/products/aria")
    expect(within(li).getByText("Halden")).toBeInTheDocument()
    expect(within(li).getByText("$299.00")).toHaveClass("text-destructive")
    expect(li.querySelector(".line-through")).toHaveTextContent("Was $349.00")
    expect(within(li).getByRole("textbox", { name: "Quantity of Aria" })).toHaveValue("2")
    expect(within(li).getByText("$598.00")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "2 items" })).toBeInTheDocument()
  })

  it("shows subtotal, savings and how far the cart is from free shipping", () => {
    const cart = makeCart([
      makeCartItem({ priceCents: 1500, compareAtCents: 2000, onSale: true, quantity: 2 }),
      makeCartItem({ priceCents: 1999, quantity: 1 }),
    ])
    render(<CartView cart={cart} />)

    expect(row("Subtotal")).toHaveTextContent("$49.99")
    expect(row("You save")).toHaveTextContent("−$10.00")
    expect(row("Shipping")).toHaveTextContent("Calculated at checkout")
    expect(screen.getByText(/away from free shipping/)).toHaveTextContent("$0.01 away from free shipping")
    expect(screen.getByRole("progressbar", { name: "Progress to free shipping" })).toHaveAttribute("aria-valuenow", "99")
  })

  it("unlocks free shipping exactly at the threshold and hides savings when there are none", () => {
    render(<CartView cart={makeCart([makeCartItem({ priceCents: 2500, quantity: 2 })])} />)

    expect(row("Subtotal")).toHaveTextContent("$50.00")
    expect(row("Shipping")).toHaveTextContent("Free")
    expect(screen.getByText("Free shipping unlocked")).toBeInTheDocument()
    expect(screen.queryByText(/away from free shipping/)).not.toBeInTheDocument()
    expect(screen.queryByText("You save")).not.toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Progress to free shipping" })).toHaveAttribute("aria-valuenow", "100")
  })

  it("has a disabled checkout button", () => {
    render(<CartView cart={makeCart([makeCartItem()])} />)
    expect(screen.getByRole("button", { name: "Checkout (coming soon)" })).toBeDisabled()
  })

  it("updates the quantity and totals at once while the change is saved", async () => {
    const user = userEvent.setup()
    const pending = deferred<CartActionResult>()
    updateCartItem.mockReturnValue(pending.promise)
    const item = makeCartItem({ name: "Aria", priceCents: 1000, quantity: 1, stock: 5 })
    render(<CartView cart={makeCart([item])} />)

    await user.click(screen.getByRole("button", { name: "Increase quantity of Aria" }))

    expect(updateCartItem).toHaveBeenCalledExactlyOnceWith({ productId: item.productId, quantity: 2 })
    expect(screen.getByRole("textbox", { name: "Quantity of Aria" })).toHaveValue("2")
    expect(row("Subtotal")).toHaveTextContent("$20.00")
    expect(screen.getByRole("heading", { name: "2 items" })).toBeInTheDocument()

    await act(async () => pending.resolve({ ok: true, itemCount: 2 }))
    expect(notify.error).not.toHaveBeenCalled()
  })

  it("rolls the quantity back and shows an error toast when the update fails", async () => {
    const user = userEvent.setup()
    const pending = deferred<CartActionResult>()
    updateCartItem.mockReturnValue(pending.promise)
    const item = makeCartItem({ name: "Aria", priceCents: 1000, quantity: 3, stock: 5 })
    render(<CartView cart={makeCart([item])} />)

    await user.click(screen.getByRole("button", { name: "Decrease quantity of Aria" }))
    expect(screen.getByRole("textbox", { name: "Quantity of Aria" })).toHaveValue("2")

    await act(async () => pending.resolve({ ok: false, message: "Something went wrong. Please try again." }))

    expect(screen.getByRole("textbox", { name: "Quantity of Aria" })).toHaveValue("3")
    expect(row("Subtotal")).toHaveTextContent("$30.00")
    expect(notify.error).toHaveBeenCalledExactlyOnceWith("Couldn't update your cart", {
      description: "Something went wrong. Please try again.",
    })
  })

  it("shows the action's note when a quantity was capped", async () => {
    const user = userEvent.setup()
    updateCartItem.mockResolvedValue({ ok: true, message: "Only 4 available.", itemCount: 4 })
    render(<CartView cart={makeCart([makeCartItem({ name: "Aria", quantity: 3, stock: 5 })])} />)

    await user.click(screen.getByRole("button", { name: "Increase quantity of Aria" }))

    await waitFor(() => expect(notify.warning).toHaveBeenCalledExactlyOnceWith("Only 4 available."))
  })

  it("removes a line at once and brings it back if the removal fails", async () => {
    const user = userEvent.setup()
    const pending = deferred<CartActionResult>()
    removeCartItem.mockReturnValue(pending.promise)
    const aria = makeCartItem({ name: "Aria", priceCents: 1000 })
    const tote = makeCartItem({ name: "Tote", priceCents: 500 })
    render(<CartView cart={makeCart([aria, tote])} />)

    await user.click(screen.getByRole("button", { name: "Remove Aria" }))

    expect(removeCartItem).toHaveBeenCalledExactlyOnceWith({ productId: aria.productId })
    expect(screen.queryByRole("link", { name: "Aria" })).not.toBeInTheDocument()
    expect(row("Subtotal")).toHaveTextContent("$5.00")

    await act(async () => pending.resolve({ ok: false, message: "Something went wrong. Please try again." }))

    expect(screen.getByRole("link", { name: "Aria" })).toBeInTheDocument()
    expect(row("Subtotal")).toHaveTextContent("$15.00")
    expect(notify.error).toHaveBeenCalledOnce()
  })

  it("shows the server's cart once a successful change has been refreshed", async () => {
    const user = userEvent.setup()
    const aria = makeCartItem({ name: "Aria", priceCents: 1000 })
    removeCartItem.mockResolvedValue({ ok: true, itemCount: 0 })
    const { rerender } = render(<CartView cart={makeCart([aria])} />)

    await user.click(screen.getByRole("button", { name: "Remove Aria" }))
    // What the action's refresh() delivers: the page re-rendered with the new cart.
    rerender(<CartView cart={makeCart([])} />)

    await waitFor(() => expect(screen.getByText("Your cart is empty")).toBeInTheDocument())
  })

  it("marks an out-of-stock line, leaves it out of the totals and lets it be removed", () => {
    const gone = makeCartItem({ name: "Gone", priceCents: 9900, quantity: 2, stock: 0 })
    const kept = makeCartItem({ name: "Kept", priceCents: 1000 })
    render(<CartView cart={makeCart([gone, kept])} />)

    const li = line("Gone")
    expect(within(li).getByText("Out of stock")).toBeInTheDocument()
    expect(within(li).getByText("Not included in your total.")).toBeInTheDocument()
    expect(within(li).getByText("$198.00")).toHaveClass("line-through")
    expect(within(li).getByRole("textbox", { name: "Quantity of Gone" })).toBeDisabled()
    expect(within(li).getByRole("button", { name: "Remove Gone" })).toBeEnabled()
    expect(row("Subtotal")).toHaveTextContent("$10.00")
    expect(screen.getByText("Out-of-stock items aren't included in the total.")).toBeInTheDocument()
  })

  it("offers to reduce a line that asks for more than is left, in one click", async () => {
    const user = userEvent.setup()
    updateCartItem.mockResolvedValue({ ok: true, itemCount: 3 })
    const item = makeCartItem({ name: "Aria", quantity: 5, stock: 3 })
    render(<CartView cart={makeCart([item])} />)

    const li = line("Aria")
    expect(within(li).getByText("Only 3 left")).toBeInTheDocument()
    expect(within(li).getByRole("button", { name: "Increase quantity of Aria" })).toBeDisabled()
    await user.click(within(li).getByRole("button", { name: "Reduce to 3" }))

    expect(updateCartItem).toHaveBeenCalledExactlyOnceWith({ productId: item.productId, quantity: 3 })
  })

  it("asks before clearing, and keeps the cart when the customer backs out", async () => {
    const user = userEvent.setup()
    render(<CartView cart={makeCart([makeCartItem({ name: "Aria" }), makeCartItem({ name: "Tote" })])} />)

    await user.click(screen.getByRole("button", { name: "Clear cart" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Clear your cart?" })
    expect(dialog).toHaveTextContent("This removes all 2 products from your cart.")

    await user.click(within(dialog).getByRole("button", { name: "Keep shopping" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(clearCart).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "Aria" })).toBeInTheDocument()
  })

  it("clears the cart at once after confirming, and restores it if clearing fails", async () => {
    const user = userEvent.setup()
    const pending = deferred<CartActionResult>()
    clearCart.mockReturnValue(pending.promise)
    render(<CartView cart={makeCart([makeCartItem({ name: "Aria" })])} />)

    await user.click(screen.getByRole("button", { name: "Clear cart" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Clear cart" }))

    expect(clearCart).toHaveBeenCalledOnce()
    expect(screen.getByText("Your cart is empty")).toBeInTheDocument()

    await act(async () => pending.resolve({ ok: false, message: "Something went wrong. Please try again." }))

    expect(screen.getByRole("link", { name: "Aria" })).toBeInTheDocument()
    expect(notify.error).toHaveBeenCalledOnce()
  })
})
