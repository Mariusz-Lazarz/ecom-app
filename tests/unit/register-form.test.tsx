import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

const register = vi.fn()
vi.mock("@/app/actions/register", () => ({ register: (...args: unknown[]) => register(...args) }))

const { RegisterForm } = await import("@/components/auth/register-form")

async function fillAndSubmit() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText("First name"), "Jan")
  await user.type(screen.getByLabelText("Last name"), "Kowalski")
  await user.type(screen.getByLabelText("Email"), "jan@example.com")
  await user.type(screen.getByLabelText("Password"), "secret123")
  await user.type(screen.getByLabelText("Confirm password"), "secret123")
  await user.click(screen.getByRole("button", { name: "Create account" }))
}

describe("RegisterForm", () => {
  it("renders all registration fields", () => {
    render(<RegisterForm />)
    for (const label of ["First name", "Last name", "Email", "Password", "Confirm password"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it("shows server-side field errors and keeps entered values", async () => {
    register.mockResolvedValue({
      errors: { email: ["An account with this email already exists."] },
      values: { firstName: "Jan", lastName: "Kowalski", email: "jan@example.com" },
    })
    render(<RegisterForm />)
    await fillAndSubmit()

    expect(await screen.findByText("An account with this email already exists.")).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("First name")).toHaveValue("Jan")
  })

  it("shows a welcome message after a successful sign-up", async () => {
    register.mockResolvedValue({ success: true, firstName: "Jan" })
    render(<RegisterForm />)
    await fillAndSubmit()

    expect(await screen.findByText("Welcome aboard, Jan!")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Start shopping" })).toHaveAttribute("href", "/")
  })
})
