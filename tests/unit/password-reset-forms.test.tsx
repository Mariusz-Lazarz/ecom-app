import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const actions = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }))
vi.mock("@/app/actions/password-reset", () => actions)
const login = vi.hoisted(() => vi.fn())
vi.mock("@/app/actions/login", () => ({ login }))

const { ForgotPasswordForm } = await import("@/components/auth/forgot-password-form")
const { ResetPasswordForm } = await import("@/components/auth/reset-password-form")
const { LoginForm } = await import("@/components/auth/login-form")

const TOKEN = "Xf3k9_-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"

beforeEach(() => {
  actions.requestPasswordReset.mockReset()
  actions.resetPassword.mockReset()
})

describe("LoginForm", () => {
  it("links to the forgot password page", () => {
    render(<LoginForm />)
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password")
  })
})

describe("ForgotPasswordForm", () => {
  it("submits the email and then shows the same neutral confirmation", async () => {
    actions.requestPasswordReset.mockResolvedValue({ success: true, values: { email: "ada@example.com" } })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText("Email"), "Ada@Example.com")
    await user.click(screen.getByRole("button", { name: "Send reset link" }))

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent("Check your inbox")
    expect(status).toHaveTextContent("If an account exists for ada@example.com, we've sent a link to reset your password.")
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login")
    expect((actions.requestPasswordReset.mock.calls[0][1] as FormData).get("email")).toBe("Ada@Example.com")
  })

  it("shows field errors and keeps the email", async () => {
    actions.requestPasswordReset.mockResolvedValue({ errors: { email: ["Please enter a valid email."] }, values: { email: "nope" } })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText("Email"), "nope")
    await user.click(screen.getByRole("button", { name: "Send reset link" }))

    expect(await screen.findByText("Please enter a valid email.")).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toHaveValue("nope")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
})

describe("ResetPasswordForm", () => {
  async function submit(password = "newpass123", confirm = password) {
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("New password"), password)
    await user.type(screen.getByLabelText("Confirm new password"), confirm)
    await user.click(screen.getByRole("button", { name: "Set new password" }))
  }

  it("posts the token with the new password", async () => {
    actions.resetPassword.mockResolvedValue({ errors: { confirmPassword: ["Passwords don't match."] } })
    render(<ResetPasswordForm token={TOKEN} />)
    expect(screen.getByText("At least 8 characters, with a letter and a number.")).toBeInTheDocument()

    await submit("newpass123", "other12345")

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument()
    const sent = actions.resetPassword.mock.calls[0][1] as FormData
    expect(Object.fromEntries(sent)).toEqual({ token: TOKEN, password: "newpass123", confirmPassword: "other12345" })
    // Passwords are never kept after a submit.
    expect(screen.getByLabelText("New password")).toHaveValue("")
  })

  it("lists the password rules that failed", async () => {
    actions.resetPassword.mockResolvedValue({ errors: { password: ["Contain at least one number."] } })
    render(<ResetPasswordForm token={TOKEN} />)

    await submit("password")

    expect(await screen.findByText("Password must:")).toBeInTheDocument()
    expect(screen.getByText("Contain at least one number.")).toBeInTheDocument()
  })

  it("swaps the form for a link to request a new one when the token stopped working", async () => {
    actions.resetPassword.mockResolvedValue({ invalidToken: true, message: "This password reset link is invalid or has expired." })
    render(<ResetPasswordForm token={TOKEN} />)

    await submit()

    expect(await screen.findByRole("alert")).toHaveTextContent("This password reset link is invalid or has expired.")
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password")
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument()
  })
})
