import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const subscribeToNewsletter = vi.hoisted(() => vi.fn())
vi.mock("@/app/actions/newsletter", () => ({ subscribeToNewsletter }))

const { Newsletter } = await import("@/components/home/newsletter")

beforeEach(() => {
  subscribeToNewsletter.mockReset()
})

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

  it("posts the typed email and swaps the form for a confirmation", async () => {
    subscribeToNewsletter.mockResolvedValue({ success: true, email: "shopper@example.com" })
    const user = userEvent.setup()
    render(<Newsletter />)

    await user.type(screen.getByLabelText("Email address"), "Shopper@Example.com")
    await user.click(screen.getByRole("button", { name: "Subscribe" }))

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent("You're on the list!")
    expect(status).toHaveTextContent("We've sent a confirmation with your welcome code to shopper@example.com.")
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument()
    expect(subscribeToNewsletter).toHaveBeenCalledOnce()
    expect((subscribeToNewsletter.mock.calls[0][1] as FormData).get("email")).toBe("Shopper@Example.com")
  })

  it("shows the action's field error inline and keeps the typed email", async () => {
    subscribeToNewsletter.mockResolvedValue({ errors: { email: ["Please enter a valid email."] }, values: { email: "nope@" } })
    const user = userEvent.setup()
    render(<Newsletter />)

    await user.type(screen.getByLabelText("Email address"), "nope@")
    await user.click(screen.getByRole("button", { name: "Subscribe" }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Please enter a valid email.")
    const email = screen.getByLabelText("Email address")
    expect(email).toHaveValue("nope@")
    expect(email).toHaveAttribute("aria-invalid", "true")
    expect(email).toHaveAccessibleDescription("Please enter a valid email.")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("shows a form-level failure message and lets the visitor try again", async () => {
    subscribeToNewsletter.mockResolvedValue({ message: "Something went wrong. Please try again.", values: { email: "a@b.co" } })
    const user = userEvent.setup()
    render(<Newsletter />)

    await user.type(screen.getByLabelText("Email address"), "a@b.co")
    await user.click(screen.getByRole("button", { name: "Subscribe" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.")
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeEnabled()
    expect(screen.getByLabelText("Email address")).toHaveValue("a@b.co")
  })
})
