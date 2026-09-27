import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { Newsletter } from "@/components/home/newsletter"

describe("Newsletter", () => {
  it("advertises the first-order discount", () => {
    render(<Newsletter />)

    expect(
      screen.getByRole("heading", { level: 2, name: "Get 10% off your first order" })
    ).toBeInTheDocument()
  })

  it("has a labelled, required email field", () => {
    render(<Newsletter />)

    const email = screen.getByLabelText("Email address")
    expect(email).toHaveAttribute("type", "email")
    expect(email).toBeRequired()
  })

  it("submits the form through a real submit button", () => {
    render(<Newsletter />)

    const button = screen.getByRole("button", { name: "Subscribe" })
    expect(button).toHaveAttribute("type", "submit")
    expect(button.closest("form")).toBe(screen.getByLabelText("Email address").closest("form"))
  })

  it("rejects empty and malformed emails and accepts a valid one", async () => {
    const user = userEvent.setup()
    render(<Newsletter />)

    const email = screen.getByLabelText<HTMLInputElement>("Email address")
    const form = email.closest("form")!

    expect(form.checkValidity()).toBe(false)
    expect(email.validity.valueMissing).toBe(true)

    await user.type(email, "not-an-email")
    expect(form.checkValidity()).toBe(false)
    expect(email.validity.typeMismatch).toBe(true)

    await user.clear(email)
    await user.type(email, "shopper@example.com")
    expect(form.checkValidity()).toBe(true)
  })

  it("shows the gift animation", () => {
    render(<Newsletter />)

    const gift = screen.getByRole("img", { name: /gift box/i })
    expect(within(gift).getByTestId("dotlottie")).toHaveAttribute("data-src", "/animations/gift.lottie")
  })
})
