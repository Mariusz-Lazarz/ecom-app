import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CartActionResult } from "@/app/actions/cart"
import type { Cart } from "@/lib/cart"

import { makeCart, makeCartItem } from "./fixtures/cart"

const updateCartItem = vi.fn<(input: { productId: string; quantity: number }) => Promise<CartActionResult>>()
const removeCartItem = vi.fn<(input: { productId: string }) => Promise<CartActionResult>>()
vi.mock("@/app/actions/cart", () => ({
  updateCartItem: (input: { productId: string; quantity: number }) => updateCartItem(input),
  removeCartItem: (input: { productId: string }) => removeCartItem(input),
  clearCart: vi.fn(),
}))

const notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }
vi.mock("@/lib/notify", () => ({ notify }))

const { CartSheet } = await import("@/components/cart/cart-sheet")
const { openMiniCart } = await import("@/components/cart/mini-cart-events")

const fetchMock = vi.fn<typeof fetch>()
const serve = (cart: Cart) => fetchMock.mockResolvedValue(Response.json({ cart }))

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  for (const fn of [updateCartItem, removeCartItem, ...Object.values(notify)]) fn.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe("CartSheet trigger", () => {
  it("is a link to /cart named after the count, with the count in a badge", () => {
    render(<CartSheet count={3} />)

    const link = screen.getByRole("link", { name: "Cart, 3 items" })
    expect(link).toHaveAttribute("href", "/cart")
    expect(screen.getByTestId("cart-badge")).toHaveTextContent("3")
  })

  it("uses the singular for one item", () => {
    render(<CartSheet count={1} />)
    expect(screen.getByRole("link", { name: "Cart, 1 item" })).toBeInTheDocument()
  })

  it("hides the badge for an empty cart", () => {
    render(<CartSheet count={0} />)

    expect(screen.getByRole("link", { name: "Cart, 0 items" })).toHaveAttribute("href", "/cart")
    expect(screen.queryByTestId("cart-badge")).not.toBeInTheDocument()
  })

  it("caps the badge at 99+", () => {
    render(<CartSheet count={120} />)
    expect(screen.getByTestId("cart-badge")).toHaveTextContent("99+")
  })
})

describe("CartSheet mini-cart", () => {
  it("doesn't load the cart until it's opened", () => {
    render(<CartSheet count={2} />)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("opens on click, loads the cart from the API and lists its lines with totals", async () => {
    const user = userEvent.setup()
    serve(
      makeCart([
        makeCartItem({ name: "Aria", slug: "aria", priceCents: 1500, compareAtCents: 2000, onSale: true, quantity: 2 }),
      ]),
    )
    render(<CartSheet count={2} />)

    await user.click(screen.getByRole("link", { name: "Cart, 2 items" }))

    const dialog = await screen.findByRole("dialog", { name: "Your cart (2)" })
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/cart", { cache: "no-store" })
    expect(within(dialog).getByRole("link", { name: "Aria" })).toHaveAttribute("href", "/products/aria")
    expect(within(dialog).getByRole("textbox", { name: "Quantity of Aria" })).toHaveValue("2")
    expect(within(dialog).getByText("Subtotal").nextElementSibling).toHaveTextContent("$30.00")
    expect(within(dialog).getByText("You save").nextElementSibling).toHaveTextContent("−$10.00")
    expect(within(dialog).getByText(/away from free shipping/)).toHaveTextContent("$20.00 away from free shipping")
    expect(within(dialog).getByRole("link", { name: "Go to cart" })).toHaveAttribute("href", "/cart")
    expect(within(dialog).getByRole("button", { name: "Checkout (coming soon)" })).toBeDisabled()
  })

  it("shows the empty state with a link to the products", async () => {
    const user = userEvent.setup()
    serve(makeCart([]))
    render(<CartSheet count={0} />)

    await user.click(screen.getByRole("link", { name: "Cart, 0 items" }))

    const dialog = await screen.findByRole("dialog", { name: "Your cart" })
    expect(await within(dialog).findByText("Your cart is empty")).toBeInTheDocument()
    expect(within(dialog).getByRole("link", { name: "Browse products" })).toHaveAttribute("href", "/products")
    expect(within(dialog).queryByRole("link", { name: "Go to cart" })).not.toBeInTheDocument()
  })

  it("says so when the cart can't be loaded, linking to the cart page", async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }))
    render(<CartSheet count={1} />)

    await user.click(screen.getByRole("link", { name: "Cart, 1 item" }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("We couldn't load your cart.")
    expect(within(alert).getByRole("link", { name: "Open the cart page" })).toHaveAttribute("href", "/cart")
  })

  it("leaves a modified click (new tab) to the browser", async () => {
    const user = userEvent.setup()
    render(<CartSheet count={1} />)
    const link = screen.getByRole("link", { name: "Cart, 1 item" })
    // jsdom can't open tabs; stop the navigation it would attempt.
    link.addEventListener("click", (event) => event.preventDefault())

    await user.keyboard("{Control>}")
    await user.click(link)
    await user.keyboard("{/Control}")

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("opens when another component asks for it (the toast's View cart)", async () => {
    serve(makeCart([makeCartItem({ name: "Aria" })]))
    render(<CartSheet count={1} />)

    act(() => openMiniCart())

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("reloads the cart after a quantity change made in it", async () => {
    const user = userEvent.setup()
    const aria = makeCartItem({ name: "Aria", priceCents: 1000, quantity: 1, stock: 5 })
    serve(makeCart([aria]))
    updateCartItem.mockResolvedValue({ ok: true, itemCount: 2 })
    render(<CartSheet count={1} />)

    await user.click(screen.getByRole("link", { name: "Cart, 1 item" }))
    const dialog = await screen.findByRole("dialog", { name: "Your cart (1)" })

    serve(makeCart([{ ...aria, quantity: 2, lineTotalCents: 2000 }]))
    await user.click(within(dialog).getByRole("button", { name: "Increase quantity of Aria" }))

    expect(updateCartItem).toHaveBeenCalledExactlyOnceWith({ productId: aria.productId, quantity: 2 })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await screen.findByRole("dialog", { name: "Your cart (2)" })
    expect(within(dialog).getByRole("textbox", { name: "Quantity of Aria" })).toHaveValue("2")
  })

  it("removes a line and rolls it back with an error toast when that fails", async () => {
    const user = userEvent.setup()
    serve(makeCart([makeCartItem({ name: "Aria" })]))
    removeCartItem.mockResolvedValue({ ok: false, message: "Something went wrong. Please try again." })
    render(<CartSheet count={1} />)

    await user.click(screen.getByRole("link", { name: "Cart, 1 item" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(await within(dialog).findByRole("button", { name: "Remove Aria" }))

    await waitFor(() => expect(notify.error).toHaveBeenCalledOnce())
    expect(await within(dialog).findByRole("link", { name: "Aria" })).toBeInTheDocument()
    // A failed edit leaves the loaded cart alone: no reload.
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("closes when a product link is followed", async () => {
    const user = userEvent.setup()
    serve(makeCart([makeCartItem({ name: "Aria" })]))
    render(<CartSheet count={1} />)

    await user.click(screen.getByRole("link", { name: "Cart, 1 item" }))
    const dialog = await screen.findByRole("dialog")
    const link = await within(dialog).findByRole("link", { name: "Aria" })
    link.addEventListener("click", (event) => event.preventDefault())
    await user.click(link)

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })
})
