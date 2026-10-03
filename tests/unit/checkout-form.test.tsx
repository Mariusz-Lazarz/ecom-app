import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CheckoutFormState, CheckoutValues } from "@/lib/validation/checkout"

import { makeCart, makeCartItem } from "./fixtures/cart"

const placeOrder = vi.fn<(state: CheckoutFormState, formData: FormData) => Promise<CheckoutFormState>>()
vi.mock("@/app/actions/orders", () => ({
  placeOrder: (state: CheckoutFormState, formData: FormData) => placeOrder(state, formData),
}))

const { CheckoutForm } = await import("@/components/checkout/checkout-form")

const filled: CheckoutValues = {
  fullName: "Ada Lovelace",
  line1: "12 Analytical Row",
  line2: "",
  city: "London",
  postalCode: "EC1A 1BB",
  country: "GB",
  phone: "+44 20 7946 0958",
}

const totals = () => document.querySelector<HTMLElement>('dl[aria-label="Order totals"]')!
const row = (label: RegExp | string) => within(totals()).getByText(label).nextElementSibling!
const submit = () => screen.getByRole("button", { name: /Place order|Placing order/ })
const shippingOption = (name: RegExp) => screen.getByRole("radio", { name })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  placeOrder.mockReset()
})

describe("CheckoutForm", () => {
  it("prefills the address and defaults to standard shipping and card payment", () => {
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={filled} />)

    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace")
    expect(screen.getByLabelText("Address")).toHaveValue("12 Analytical Row")
    expect(screen.getByLabelText("City")).toHaveValue("London")
    expect(screen.getByLabelText("Postal code")).toHaveValue("EC1A 1BB")
    expect(screen.getByLabelText("Phone")).toHaveValue("+44 20 7946 0958")
    expect(screen.getByRole("combobox", { name: "Country" })).toHaveTextContent("United Kingdom")
    expect(shippingOption(/^Standard/)).toBeChecked()
    expect(screen.getByRole("radio", { name: /^Credit & debit cards/ })).toBeChecked()
  })

  it("posts every field, including the chosen methods", async () => {
    const user = userEvent.setup()
    placeOrder.mockResolvedValue({ message: "Your cart is empty.", values: {} })
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={filled} />)

    await user.click(shippingOption(/^Express/))
    await user.click(screen.getByRole("radio", { name: /^Digital wallets/ }))
    await user.type(screen.getByLabelText("Apartment, suite, etc. (optional)"), "Flat 3")
    await user.click(submit())

    await waitFor(() => expect(placeOrder).toHaveBeenCalledOnce())
    const sent = Object.fromEntries(placeOrder.mock.calls[0][1].entries())
    expect(sent).toEqual({
      ...filled,
      line2: "Flat 3",
      shippingMethodId: "express",
      paymentMethodId: "wallets",
    })
  })

  it("shows the action's field errors inline and keeps what was typed", async () => {
    const user = userEvent.setup()
    placeOrder.mockResolvedValue({
      message: "Please check the highlighted fields.",
      errors: { city: ["City is required."], phone: ["Please enter a valid phone number."] },
      values: { ...filled, city: "", phone: "abc", shippingMethodId: "next-day", paymentMethodId: "gift-cards" },
    })
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={filled} />)

    await user.click(submit())

    expect(await screen.findByText("City is required.")).toBeInTheDocument()
    expect(screen.getByLabelText("City")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("City")).toHaveAccessibleDescription("City is required.")
    expect(screen.getByLabelText("Phone")).toHaveValue("abc")
    expect(screen.getByLabelText("Phone")).toHaveAccessibleDescription("Please enter a valid phone number.")
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace")
    expect(screen.getByLabelText("Full name")).not.toHaveAttribute("aria-invalid")
    expect(shippingOption(/^Next day/)).toBeChecked()
    expect(screen.getByRole("radio", { name: /^Gift cards/ })).toBeChecked()
    expect(screen.getByText("Please check the highlighted fields.")).toBeInTheDocument()
    // Field errors are fixed on this page, so there's no link back to the cart.
    expect(screen.queryByRole("link", { name: "Review your cart" })).not.toBeInTheDocument()
  })

  it("shows a form-level problem (e.g. stock) with a link back to the cart", async () => {
    const user = userEvent.setup()
    const message = "Some items in your cart aren't available in the quantity you asked for: Aria (only 1 left)."
    placeOrder.mockResolvedValue({ message, values: filled })
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={filled} />)

    await user.click(submit())

    const alert = await screen.findByText(message)
    expect(alert.closest('[role="alert"]')).toHaveTextContent("We couldn't place your order")
    expect(screen.getByRole("link", { name: "Review your cart" })).toHaveAttribute("href", "/cart")
    expect(screen.getByLabelText("City")).toHaveValue("London")
  })

  it("shows the pending state and blocks a second submit while the order is placed", async () => {
    const user = userEvent.setup()
    const pending = deferred<CheckoutFormState>()
    placeOrder.mockReturnValue(pending.promise)
    render(<CheckoutForm cart={makeCart([makeCartItem({ priceCents: 1000 })])} defaults={filled} />)

    expect(submit()).toHaveTextContent("Place order · $15.99")
    await user.click(submit())

    await waitFor(() => expect(submit()).toBeDisabled())
    expect(submit()).toHaveTextContent("Placing order…")
    await user.click(submit())
    expect(placeOrder).toHaveBeenCalledOnce()

    pending.resolve({ message: "Your cart is empty.", values: filled })
    await waitFor(() => expect(submit()).toBeEnabled())
    expect(submit()).toHaveTextContent("Place order")
  })

  describe("order summary", () => {
    it("lists each line with its quantity, unit price and line total", () => {
      const item = makeCartItem({ name: "Aria", priceCents: 1250, quantity: 2 })
      render(<CheckoutForm cart={makeCart([item])} defaults={filled} />)

      const line = within(screen.getByRole("list", { name: "Items in your order" })).getByText("Aria").closest("li")!
      expect(line).toHaveTextContent("2 × $12.50")
      expect(line).toHaveTextContent("$25.00")
      expect(within(line).getByRole("img")).toHaveAttribute("alt", item.image!.alt)
    })

    it("charges standard shipping just under the free-shipping threshold", () => {
      render(<CheckoutForm cart={makeCart([makeCartItem({ priceCents: 4999 })])} defaults={filled} />)

      expect(row("Subtotal")).toHaveTextContent("$49.99")
      expect(row("Shipping (Standard)")).toHaveTextContent("$5.99")
      expect(row("Total")).toHaveTextContent("$55.98")
      expect(within(shippingOption(/^Standard/).closest("label")!).getByText("$5.99")).toBeInTheDocument()
    })

    it("makes standard shipping free at exactly the threshold, showing the waived price", () => {
      render(<CheckoutForm cart={makeCart([makeCartItem({ priceCents: 5000 })])} defaults={filled} />)

      expect(row("Shipping (Standard)")).toHaveTextContent("Free")
      expect(row("Total")).toHaveTextContent("$50.00")
      const standard = shippingOption(/^Standard/).closest("label")!
      expect(within(standard).getByText("$5.99")).toHaveClass("line-through")
      expect(within(standard).getByText("Free")).toBeInTheDocument()
    })

    it("recomputes the totals when a method that isn't free-eligible is picked", async () => {
      const user = userEvent.setup()
      render(<CheckoutForm cart={makeCart([makeCartItem({ priceCents: 5000 })])} defaults={filled} />)

      await user.click(shippingOption(/^Express/))

      expect(row("Shipping (Express)")).toHaveTextContent("$12.99")
      expect(row("Total")).toHaveTextContent("$62.99")
      expect(submit()).toHaveTextContent("Place order · $62.99")

      await user.click(shippingOption(/^Parcel locker pickup/))
      expect(row("Shipping (Parcel locker pickup)")).toHaveTextContent("Free")
      expect(row("Total")).toHaveTextContent("$50.00")
    })

    it("shows savings from on-sale lines and leaves out-of-stock lines out of the total", () => {
      const cart = makeCart([
        makeCartItem({ priceCents: 2000, compareAtCents: 2500, onSale: true }),
        makeCartItem({ priceCents: 9000, stock: 0 }),
      ])
      render(<CheckoutForm cart={cart} defaults={filled} />)

      expect(row("You save")).toHaveTextContent("−$5.00")
      expect(row("Subtotal")).toHaveTextContent("$20.00")
      expect(row("Total")).toHaveTextContent("$25.99")
    })
  })

  it("says payment is simulated and never asks for card details", () => {
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={filled} />)

    expect(screen.getByRole("note")).toHaveTextContent("This is a demo store; no real payment is taken.")
    expect(screen.getAllByRole("radio", { name: /cards|wallets|Pay-in-4|Gift cards/i })).toHaveLength(4)
    expect(screen.queryByLabelText(/card number|cvc|cvv|expiry|expiration/i)).not.toBeInTheDocument()
    expect(document.querySelector('[autocomplete^="cc-"]')).toBeNull()
    // The only fields posted besides the two radio groups are the address ones.
    const named = [...document.querySelectorAll<HTMLInputElement>("input[name]:not([type=radio])")].map((el) => el.name)
    expect(named.sort()).toEqual(["city", "country", "fullName", "line1", "line2", "phone", "postalCode"])
  })

  it("disables placing the order and links to the cart while a line can't be bought", () => {
    render(<CheckoutForm cart={makeCart([makeCartItem({ quantity: 3, stock: 1 })])} defaults={filled} />)

    expect(submit()).toBeDisabled()
    expect(screen.getByText("Reduce the quantities to what's in stock to check out.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Review your cart" })).toHaveAttribute("href", "/cart")
  })
})
