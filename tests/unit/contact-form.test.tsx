import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const sendContactMessage = vi.hoisted(() => vi.fn())
vi.mock("@/app/actions/contact", () => ({ sendContactMessage }))

const { ContactForm } = await import("@/components/contact/contact-form")

beforeEach(() => {
  sendContactMessage.mockReset()
})

const posted = () => sendContactMessage.mock.calls[0][1] as FormData

describe("ContactForm", () => {
  it("starts empty for guests, with the order number optional", () => {
    render(<ContactForm defaults={{}} signedIn={false} />)

    expect(screen.getByLabelText("Name")).toHaveValue("")
    expect(screen.getByLabelText("Email")).toHaveValue("")
    expect(screen.getByLabelText("Order number (optional)")).not.toBeRequired()
    expect(screen.getByLabelText("Order number (optional)")).toHaveAccessibleDescription("If your message is about an order.")
    expect(screen.getByText("0 / 2000")).toBeInTheDocument()
  })

  it("prefills a signed-in user's name, email and a preselected topic", () => {
    render(<ContactForm defaults={{ name: "Ada Lovelace", email: "ada@example.com", topic: "returns" }} signedIn />)

    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace")
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com")
    expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent("Returns & refunds")
    expect(screen.getByLabelText("Order number (optional)")).toHaveAccessibleDescription(
      "One of your orders, if your message is about one.",
    )
  })

  it("hides the honeypot from people and keyboards", () => {
    const { container } = render(<ContactForm defaults={{}} signedIn={false} />)

    const honeypot = container.querySelector<HTMLInputElement>('input[name="website"]')!
    expect(honeypot).toHaveAttribute("tabindex", "-1")
    expect(honeypot.closest("[aria-hidden]")).not.toBeNull()
    expect(screen.queryByRole("textbox", { name: "Leave this field empty" })).not.toBeInTheDocument()
  })

  it("counts the message's characters as they're typed", async () => {
    const user = userEvent.setup()
    render(<ContactForm defaults={{}} signedIn={false} />)

    await user.type(screen.getByLabelText("Message"), "Hello there")

    expect(screen.getByText("11 / 2000")).toBeInTheDocument()
  })

  it("shows field errors under their fields and keeps the typed values", async () => {
    sendContactMessage.mockResolvedValue({
      errors: { message: ["Write at least 10 characters."], orderNumber: ["We couldn't find this order on your account."] },
      values: { name: "Ada", email: "ada@example.com", orderNumber: "NC-1", topic: "order", message: "Hi" },
    })
    const user = userEvent.setup()
    render(<ContactForm defaults={{ name: "Ada", email: "ada@example.com" }} signedIn />)

    await user.type(screen.getByLabelText("Message"), "Hi")
    await user.click(screen.getByRole("button", { name: "Send message" }))

    expect(await screen.findByText("Write at least 10 characters.")).toBeInTheDocument()
    const message = screen.getByLabelText("Message")
    expect(message).toHaveValue("Hi")
    expect(message).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Order number (optional)")).toHaveValue("NC-1")
    expect(screen.getByText("We couldn't find this order on your account.")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent("An order")
    expect(posted().get("message")).toBe("Hi")
    expect(posted().get("website")).toBe("")
  })

  it("shows a form-level message such as the rate limit above the button", async () => {
    sendContactMessage.mockResolvedValue({ message: "Please wait a minute.", values: { name: "Ada" } })
    const user = userEvent.setup()
    render(<ContactForm defaults={{}} signedIn={false} />)

    await user.click(screen.getByRole("button", { name: "Send message" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Please wait a minute.")
    expect(screen.getByLabelText("Name")).toHaveValue("Ada")
  })

  it("thanks the sender after sending and can start a fresh message", async () => {
    sendContactMessage.mockResolvedValue({ success: true, name: "Ada Lovelace", email: "ada@example.com" })
    const user = userEvent.setup()
    render(<ContactForm defaults={{ name: "Ada Lovelace", email: "ada@example.com" }} signedIn />)

    await user.type(screen.getByLabelText("Message"), "Where is my parcel?")
    await user.click(screen.getByRole("button", { name: "Send message" }))

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent("Thanks, Ada! We've got your message.")
    expect(status).toHaveTextContent("We'll reply to ada@example.com")

    await user.click(screen.getByRole("button", { name: "Send another message" }))
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Message")).toHaveValue("")
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace")
  })
})
