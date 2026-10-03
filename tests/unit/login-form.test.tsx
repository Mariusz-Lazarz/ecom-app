import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

const login = vi.fn()
vi.mock("@/app/actions/login", () => ({ login: (...args: unknown[]) => login(...args) }))

const { LoginForm } = await import("@/components/auth/login-form")

async function fillAndSubmit() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText("Email"), "jan@example.com")
  await user.type(screen.getByLabelText("Password"), "wrong-pass1")
  await user.click(screen.getByRole("button", { name: "Sign in" }))
}

describe("LoginForm", () => {
  it("renders email and password fields and links to registration", () => {
    render(<LoginForm />)
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email")
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password")
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register")
  })

  it("posts the callbackUrl with the credentials, and keeps it after a failed attempt", async () => {
    login.mockResolvedValue({ message: "Invalid email or password.", values: { email: "jan@example.com" } })
    render(<LoginForm callbackUrl="/checkout" />)
    await fillAndSubmit()

    await screen.findByRole("alert")
    const sent = login.mock.calls.at(-1)![1] as FormData
    expect(sent.get("callbackUrl")).toBe("/checkout")
    expect(document.querySelector('input[name="callbackUrl"]')).toHaveValue("/checkout")
  })

  it("sends no callbackUrl without one", async () => {
    login.mockResolvedValue({ message: "Invalid email or password.", values: { email: "jan@example.com" } })
    render(<LoginForm />)
    await fillAndSubmit()

    await screen.findByRole("alert")
    expect((login.mock.calls.at(-1)![1] as FormData).has("callbackUrl")).toBe(false)
  })

  it("shows the error from the server and keeps the email", async () => {
    login.mockResolvedValue({ message: "Invalid email or password.", values: { email: "jan@example.com" } })
    render(<LoginForm />)
    await fillAndSubmit()

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.")
    expect(screen.getByLabelText("Email")).toHaveValue("jan@example.com")
    expect(screen.getByLabelText("Password")).toHaveValue("")
  })

  it("marks invalid fields", async () => {
    login.mockResolvedValue({ errors: { email: ["Please enter a valid email."] }, values: { email: "nope" } })
    render(<LoginForm />)
    await fillAndSubmit()

    expect(await screen.findByText("Please enter a valid email.")).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true")
  })
})
