import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DiscountActionResult } from "@/app/actions/cart"
import type { CheckoutFormState, CheckoutValues } from "@/lib/validation/checkout"

import { makeCart, makeCartItem } from "./fixtures/cart"

const placeOrder = vi.fn<(state: CheckoutFormState, formData: FormData) => Promise<CheckoutFormState>>()
vi.mock("@/app/actions/orders", () => ({
  placeOrder: (state: CheckoutFormState, formData: FormData) => placeOrder(state, formData),
}))

const applyDiscountCode = vi.fn<(code: string) => Promise<DiscountActionResult>>()
const removeDiscountCode = vi.fn<() => Promise<DiscountActionResult>>()
vi.mock("@/app/actions/cart", () => ({
  applyDiscountCode: (code: string) => applyDiscountCode(code),
  removeDiscountCode: () => removeDiscountCode(),
}))

const notify = { success: vi.fn(), error: vi.fn() }
vi.mock("@/lib/notify", () => ({ notify }))

const { CheckoutForm, initialAddressChoice } = await import("@/components/checkout/checkout-form")
type CheckoutAddressOption = import("@/components/checkout/checkout-form").CheckoutAddressOption

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
  applyDiscountCode.mockReset()
  removeDiscountCode.mockReset()
  notify.success.mockReset()
  notify.error.mockReset()
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

describe("CheckoutForm discount code", () => {
  const welcome = { code: "WELCOME10", type: "percent", value: 10, minSubtotalCents: 3000 } as const
  const codeInput = () => screen.getByLabelText("Discount code")
  const applyButton = () => screen.getByRole("button", { name: "Apply" })

  it("shows an empty code field and no discount line without a code", () => {
    render(<CheckoutForm cart={makeCart([makeCartItem({ priceCents: 4000 })])} defaults={filled} />)

    expect(codeInput()).toHaveValue("")
    expect(applyButton()).toBeDisabled()
    expect(within(totals()).queryByText(/^Discount/)).not.toBeInTheDocument()
  })

  it("applies the typed code through the cart action and confirms it", async () => {
    const user = userEvent.setup()
    applyDiscountCode.mockResolvedValue({ ok: true, code: "WELCOME10" })
    render(<CheckoutForm cart={makeCart([makeCartItem({ priceCents: 4000 })])} defaults={filled} />)

    await user.type(codeInput(), "welcome10")
    await user.click(applyButton())

    expect(applyDiscountCode).toHaveBeenCalledExactlyOnceWith("welcome10")
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith("WELCOME10 applied"))
    expect(codeInput()).toHaveValue("")
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it("applies on Enter instead of placing the order", async () => {
    const user = userEvent.setup()
    applyDiscountCode.mockResolvedValue({ ok: true, code: "FREESHIP" })
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={filled} />)

    await user.type(codeInput(), "FREESHIP{Enter}")

    await waitFor(() => expect(applyDiscountCode).toHaveBeenCalledExactlyOnceWith("FREESHIP"))
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it("shows why a code was refused under the field, and clears it on edit", async () => {
    const user = userEvent.setup()
    applyDiscountCode.mockResolvedValue({ ok: false, message: "EXPIRED5 has expired." })
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={filled} />)

    await user.type(codeInput(), "EXPIRED5")
    await user.click(applyButton())

    expect(await screen.findByText("EXPIRED5 has expired.")).toBeInTheDocument()
    expect(codeInput()).toHaveAttribute("aria-invalid", "true")
    expect(codeInput()).toHaveAccessibleDescription("EXPIRED5 has expired.")
    expect(codeInput()).toHaveValue("EXPIRED5")
    expect(notify.success).not.toHaveBeenCalled()

    await user.type(codeInput(), "X")
    expect(screen.queryByText("EXPIRED5 has expired.")).not.toBeInTheDocument()
    expect(codeInput()).not.toHaveAttribute("aria-invalid")
  })

  it("doesn't post the code field with the order", async () => {
    const user = userEvent.setup()
    placeOrder.mockResolvedValue({ message: "Your cart is empty.", values: {} })
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={filled} />)

    await user.type(codeInput(), "TYPED")
    await user.click(submit())

    await waitFor(() => expect(placeOrder).toHaveBeenCalledOnce())
    expect([...placeOrder.mock.calls[0][1].values()]).not.toContain("TYPED")
  })

  it("takes an applied percent code off the total and shows it in place of the field", async () => {
    const user = userEvent.setup()
    removeDiscountCode.mockResolvedValue({ ok: true })
    const cart = { ...makeCart([makeCartItem({ priceCents: 4000 })]), discount: welcome }
    render(<CheckoutForm cart={cart} defaults={filled} />)

    expect(row("Discount (WELCOME10)")).toHaveTextContent("−$4.00")
    expect(row("Shipping (Standard)")).toHaveTextContent("$5.99")
    expect(row("Total")).toHaveTextContent("$41.99")
    expect(submit()).toHaveTextContent("Place order · $41.99")
    expect(screen.queryByLabelText("Discount code")).not.toBeInTheDocument()
    expect(screen.getByText("WELCOME10")).toBeInTheDocument()
    expect(screen.getByText("· 10% off")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Remove discount code WELCOME10" }))
    expect(removeDiscountCode).toHaveBeenCalledOnce()
  })

  it("makes every method free with a free-shipping code, showing the waived prices", async () => {
    const user = userEvent.setup()
    const cart = {
      ...makeCart([makeCartItem({ priceCents: 1000 })]),
      discount: { code: "FREESHIP", type: "free_shipping", value: 0, minSubtotalCents: 0 } as const,
    }
    render(<CheckoutForm cart={cart} defaults={filled} />)

    expect(row("Discount (FREESHIP)")).toHaveTextContent("Free shipping")
    expect(row("Shipping (Standard)")).toHaveTextContent("Free")
    expect(row("Total")).toHaveTextContent("$10.00")
    const express = shippingOption(/^Express/).closest("label")!
    expect(within(express).getByText("$12.99")).toHaveClass("line-through")

    await user.click(shippingOption(/^Next day/))
    expect(row("Shipping (Next day)")).toHaveTextContent("Free")
    expect(row("Total")).toHaveTextContent("$10.00")
  })

  it("explains a code the cart just dropped", () => {
    const cart = {
      ...makeCart([makeCartItem({ priceCents: 1000 })]),
      discountNotice: "WELCOME10 needs a subtotal of at least $30.00. Add $20.00 more to use it. We've removed it from your cart.",
    }
    render(<CheckoutForm cart={cart} defaults={filled} />)

    const notice = screen.getByRole("status")
    expect(notice).toHaveTextContent("Discount code removed")
    expect(notice).toHaveTextContent("Add $20.00 more to use it.")
    expect(row("Total")).toHaveTextContent("$15.99")
  })
})

describe("CheckoutForm saved addresses", () => {
  const home = {
    id: "5f0c6a2e-3b1d-4c7e-9a8b-0c1d2e3f4a5b",
    label: "Home",
    fullName: "Ada Lovelace",
    line1: "12 Analytical Row",
    line2: "Flat 3",
    city: "London",
    postalCode: "EC1A 1BB",
    country: "GB",
    phone: "+44 20 7946 0958",
    isDefault: false,
  }
  const office = {
    ...home,
    id: "6a1d7b3f-4c2e-4d8f-8b9c-1d2e3f4a5b6c",
    label: "Office",
    line1: "1 Engine Street",
    line2: null,
    isDefault: true,
  }
  const newOnly: CheckoutValues = { fullName: "Ada Lovelace" }

  it("offers the saved addresses with the default preselected and no address form", () => {
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={newOnly} addresses={[home, office]} canSaveAddress />)

    const picker = screen.getByRole("radiogroup", { name: "Shipping address" })
    const options = within(picker).getAllByRole("radio")
    expect(options).toHaveLength(3)
    expect(within(picker).getByRole("radio", { name: /^Office/ })).toBeChecked()
    expect(within(picker).getByRole("radio", { name: /^Home/ })).not.toBeChecked()
    expect(within(picker).getByRole("radio", { name: /^Use a new address/ })).not.toBeChecked()
    expect(within(picker).getByText("Default")).toBeInTheDocument()
    expect(picker).toHaveTextContent("12 Analytical Row, Flat 3")
    expect(picker).toHaveTextContent("EC1A 1BB London, United Kingdom")
    expect(screen.queryByLabelText("City")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Save this address to my account")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/account/addresses")
  })

  it("preselects the first address when none is the default", () => {
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={newOnly} addresses={[home, { ...office, isDefault: false }]} />)

    expect(screen.getByRole("radio", { name: /^Home/ })).toBeChecked()
  })

  it("posts only the picked address's id with the methods", async () => {
    const user = userEvent.setup()
    placeOrder.mockResolvedValue({ message: "Your cart is empty.", values: {} })
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={newOnly} addresses={[home, office]} canSaveAddress />)

    await user.click(screen.getByRole("radio", { name: /^Home/ }))
    await user.click(submit())

    await waitFor(() => expect(placeOrder).toHaveBeenCalledOnce())
    expect(Object.fromEntries(placeOrder.mock.calls[0][1].entries())).toEqual({
      addressId: home.id,
      shippingMethodId: "standard",
      paymentMethodId: "cards",
    })
  })

  it("reveals the address form for a new address, with the save checkbox, and posts both", async () => {
    const user = userEvent.setup()
    placeOrder.mockResolvedValue({ message: "Your cart is empty.", values: {} })
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={newOnly} addresses={[office]} canSaveAddress />)

    await user.click(screen.getByRole("radio", { name: /^Use a new address/ }))
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace")
    const save = screen.getByRole("checkbox", { name: "Save this address to my account" })
    expect(save).not.toBeChecked()
    await user.type(screen.getByLabelText("Address"), "7 Difference Lane")
    await user.type(screen.getByLabelText("City"), "Leeds")
    await user.type(screen.getByLabelText("Postal code"), "LS1 1AA")
    await user.type(screen.getByLabelText("Phone"), "+44 113 496 0000")
    await user.click(save)
    await user.click(submit())

    await waitFor(() => expect(placeOrder).toHaveBeenCalledOnce())
    expect(Object.fromEntries(placeOrder.mock.calls[0][1].entries())).toEqual({
      addressId: "new",
      fullName: "Ada Lovelace",
      line1: "7 Difference Lane",
      line2: "",
      city: "Leeds",
      postalCode: "LS1 1AA",
      country: "US",
      phone: "+44 113 496 0000",
      saveAddress: "on",
      shippingMethodId: "standard",
      paymentMethodId: "cards",
    })
  })

  it("doesn't post saveAddress when the box is left unticked", async () => {
    const user = userEvent.setup()
    placeOrder.mockResolvedValue({ message: "Your cart is empty.", values: {} })
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={filled} canSaveAddress />)

    // Without saved addresses there's no picker: the form is the address.
    expect(screen.queryByRole("radiogroup", { name: "Shipping address" })).not.toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Save this address to my account" })).toBeInTheDocument()
    await user.click(submit())

    await waitFor(() => expect(placeOrder).toHaveBeenCalledOnce())
    const sent = placeOrder.mock.calls[0][1]
    expect(sent.has("saveAddress")).toBe(false)
    expect(sent.has("addressId")).toBe(false)
  })

  it("hides the save checkbox at the address limit", async () => {
    const user = userEvent.setup()
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={newOnly} addresses={[office]} canSaveAddress={false} />)

    await user.click(screen.getByRole("radio", { name: /^Use a new address/ }))

    expect(screen.getByLabelText("City")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: "Save this address to my account" })).not.toBeInTheDocument()
  })

  it("keeps a new address, its errors and the ticked box after a failed submit", async () => {
    const user = userEvent.setup()
    placeOrder.mockResolvedValue({
      message: "Please check the highlighted fields.",
      errors: { city: ["City is required."] },
      values: { ...filled, city: "", addressId: "new", saveAddress: "on", shippingMethodId: "standard", paymentMethodId: "cards" },
    })
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={newOnly} addresses={[office]} canSaveAddress />)

    await user.click(screen.getByRole("radio", { name: /^Use a new address/ }))
    await user.click(submit())

    expect(await screen.findByText("City is required.")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /^Use a new address/ })).toBeChecked()
    expect(screen.getByLabelText("Address")).toHaveValue("12 Analytical Row")
    expect(screen.getByRole("checkbox", { name: "Save this address to my account" })).toBeChecked()
  })

  it("shows why a picked address was refused and keeps the choice", async () => {
    const user = userEvent.setup()
    const message = "That address is no longer saved. Pick another one or enter a new address."
    placeOrder.mockResolvedValue({ message, errors: { addressId: [message] }, values: { addressId: home.id } })
    render(<CheckoutForm cart={makeCart([makeCartItem()])} defaults={newOnly} addresses={[home, office]} />)

    await user.click(screen.getByRole("radio", { name: /^Home/ }))
    await user.click(submit())

    expect(await screen.findAllByText(message)).not.toHaveLength(0)
    expect(screen.getByRole("radiogroup", { name: "Shipping address" })).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("radio", { name: /^Home/ })).toBeChecked()
  })
})

describe("initialAddressChoice", () => {
  const a = { id: "a", isDefault: false } as CheckoutAddressOption
  const b = { id: "b", isDefault: true } as CheckoutAddressOption

  it.each([
    ["the default without a posted choice", [a, b], undefined, "b"],
    ["the first when none is the default", [a, { ...b, isDefault: false }], undefined, "a"],
    ["a new address without saved ones", [], undefined, "new"],
    ["the posted saved address", [a, b], "a", "a"],
    ["a posted new address", [a, b], "new", "new"],
    ["the default when the posted one is gone", [a, b], "deleted", "b"],
  ])("picks %s", (_case, addresses, posted, expected) => {
    expect(initialAddressChoice(addresses, posted)).toBe(expected)
  })
})
