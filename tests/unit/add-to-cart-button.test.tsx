import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CartActionResult } from "@/app/actions/cart"

const addToCart = vi.fn<(input: { productId: string; quantity: number }) => Promise<CartActionResult>>()
vi.mock("@/app/actions/cart", () => ({ addToCart: (input: { productId: string; quantity: number }) => addToCart(input) }))

const notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }
vi.mock("@/lib/notify", () => ({ notify }))

const { AddToCartButton } = await import("@/components/products/add-to-cart-button")
const { OPEN_MINI_CART_EVENT } = await import("@/components/cart/mini-cart-events")

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  addToCart.mockReset()
  Object.values(notify).forEach((fn) => fn.mockReset())
})

describe("AddToCartButton (quick add)", () => {
  it("adds one unit and confirms with the product name and a View cart action that opens the mini-cart", async () => {
    const user = userEvent.setup()
    addToCart.mockResolvedValue({ ok: true, itemCount: 1 })
    render(<AddToCartButton productId={PRODUCT_ID} productName="Aria" inStock />)

    await user.click(screen.getByRole("button", { name: "Add Aria to cart" }))

    expect(addToCart).toHaveBeenCalledExactlyOnceWith({ productId: PRODUCT_ID, quantity: 1 })
    expect(notify.success).toHaveBeenCalledExactlyOnceWith("Added to cart", {
      description: "Aria",
      action: { label: "View cart", onClick: expect.any(Function) },
    })

    const opened = vi.fn()
    window.addEventListener(OPEN_MINI_CART_EVENT, opened)
    notify.success.mock.calls[0][1].action.onClick()
    window.removeEventListener(OPEN_MINI_CART_EVENT, opened)
    expect(opened).toHaveBeenCalledOnce()
  })

  it("is disabled and busy with a spinner while adding, then enabled again", async () => {
    const user = userEvent.setup()
    const pending = deferred<CartActionResult>()
    addToCart.mockReturnValue(pending.promise)
    render(<AddToCartButton productId={PRODUCT_ID} productName="Aria" inStock />)

    const button = screen.getByRole("button", { name: "Add Aria to cart" })
    await user.click(button)

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(button.querySelector('[data-slot="spinner"]')).not.toBeNull()
    expect(notify.success).not.toHaveBeenCalled()

    await act(async () => pending.resolve({ ok: true, itemCount: 1 }))

    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute("aria-busy")
    expect(button.querySelector('[data-slot="spinner"]')).toBeNull()
    expect(notify.success).toHaveBeenCalledOnce()
  })

  it("shows the action's note as a warning when the add was capped by stock", async () => {
    const user = userEvent.setup()
    addToCart.mockResolvedValue({ ok: true, message: "Only 3 available, so 2 added to your cart.", itemCount: 3 })
    render(<AddToCartButton productId={PRODUCT_ID} productName="Aria" inStock />)

    await user.click(screen.getByRole("button", { name: "Add Aria to cart" }))

    expect(notify.success).not.toHaveBeenCalled()
    expect(notify.warning).toHaveBeenCalledExactlyOnceWith("Only 3 available, so 2 added to your cart.", {
      description: "Aria",
      action: { label: "View cart", onClick: expect.any(Function) },
    })
  })

  it("shows an error toast with the action's message when it fails", async () => {
    const user = userEvent.setup()
    addToCart.mockResolvedValue({ ok: false, message: "This product is out of stock." })
    render(<AddToCartButton productId={PRODUCT_ID} productName="Aria" inStock />)

    await user.click(screen.getByRole("button", { name: "Add Aria to cart" }))

    expect(notify.error).toHaveBeenCalledExactlyOnceWith("Couldn't add to cart", {
      description: "This product is out of stock.",
    })
    expect(notify.success).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Add Aria to cart" })).toBeEnabled()
  })

  it("shows a generic error toast when the request itself fails", async () => {
    const user = userEvent.setup()
    addToCart.mockRejectedValue(new TypeError("Failed to fetch"))
    render(<AddToCartButton productId={PRODUCT_ID} productName="Aria" inStock />)

    await user.click(screen.getByRole("button", { name: "Add Aria to cart" }))

    expect(notify.error).toHaveBeenCalledExactlyOnceWith("Couldn't add to cart", {
      description: "Something went wrong. Please try again.",
    })
  })

  it("is disabled for an out-of-stock product", () => {
    render(<AddToCartButton productId={PRODUCT_ID} productName="Aria" inStock={false} />)
    expect(screen.getByRole("button", { name: "Aria is out of stock" })).toBeDisabled()
  })
})

describe("AddToCartButton (product page)", () => {
  it("adds the quantity chosen with the stepper", async () => {
    const user = userEvent.setup()
    addToCart.mockResolvedValue({ ok: true, itemCount: 3 })
    render(<AddToCartButton productId={PRODUCT_ID} productName="Aria" inStock stock={5} variant="full" />)

    await user.click(screen.getByRole("button", { name: "Increase quantity" }))
    await user.click(screen.getByRole("button", { name: "Increase quantity" }))
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveValue("3")
    await user.click(screen.getByRole("button", { name: "Add to cart" }))

    expect(addToCart).toHaveBeenCalledExactlyOnceWith({ productId: PRODUCT_ID, quantity: 3 })
  })

  it("bounds the stepper by the stock", async () => {
    const user = userEvent.setup()
    render(<AddToCartButton productId={PRODUCT_ID} productName="Aria" inStock stock={2} variant="full" />)

    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Increase quantity" }))
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveValue("2")
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled()
  })

  it("bounds the stepper at 99 when there's more in stock", async () => {
    const user = userEvent.setup()
    render(<AddToCartButton productId={PRODUCT_ID} productName="Aria" inStock stock={500} variant="full" />)

    const input = screen.getByRole("textbox", { name: "Quantity" })
    await user.clear(input)
    await user.type(input, "99{Enter}")
    expect(input).toHaveValue("99")
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled()
  })

  it("disables the stepper and the button while adding", async () => {
    const user = userEvent.setup()
    const pending = deferred<CartActionResult>()
    addToCart.mockReturnValue(pending.promise)
    render(<AddToCartButton productId={PRODUCT_ID} productName="Aria" inStock stock={5} variant="full" />)

    await user.click(screen.getByRole("button", { name: "Increase quantity" }))
    await user.click(screen.getByRole("button", { name: "Add to cart" }))

    expect(screen.getByRole("button", { name: "Add to cart" })).toBeDisabled()
    expect(screen.getByRole("textbox", { name: "Quantity" })).toBeDisabled()
    await act(async () => pending.resolve({ ok: true, itemCount: 2 }))
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeEnabled()
  })

  it("shows a disabled Out of stock button and no stepper when out of stock", () => {
    render(<AddToCartButton productId={PRODUCT_ID} productName="Aria" inStock={false} stock={0} variant="full" />)

    expect(screen.getByRole("button", { name: "Out of stock" })).toBeDisabled()
    expect(screen.queryByRole("textbox", { name: "Quantity" })).not.toBeInTheDocument()
  })
})
