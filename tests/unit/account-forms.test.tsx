import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { PasswordChangeFormState, ProfileFormState } from "@/lib/validation/account"

const updateProfile = vi.fn<(state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>>()
const changePassword = vi.fn<(state: PasswordChangeFormState, formData: FormData) => Promise<PasswordChangeFormState>>()
vi.mock("@/app/actions/account", () => ({
  updateProfile: (state: ProfileFormState, formData: FormData) => updateProfile(state, formData),
  changePassword: (state: PasswordChangeFormState, formData: FormData) => changePassword(state, formData),
}))

const { ProfileForm } = await import("@/components/account/profile-form")
const { PasswordForm } = await import("@/components/account/password-form")
const { AccountNav } = await import("@/components/account/account-nav")

const pathname = vi.hoisted(() => ({ current: "/account" }))
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }))

const profile = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" }

beforeEach(() => {
  updateProfile.mockReset()
  changePassword.mockReset()
})

describe("ProfileForm", () => {
  it("starts from the saved profile and asks for no password while the email is unchanged", async () => {
    const user = userEvent.setup()
    updateProfile.mockResolvedValue({ success: true, values: { ...profile, firstName: "Augusta" } })
    render(<ProfileForm profile={profile} />)

    expect(screen.getByLabelText("First name")).toHaveValue("Ada")
    expect(screen.getByLabelText("Last name")).toHaveValue("Lovelace")
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com")
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument()

    // A case-only change is the same email.
    await user.clear(screen.getByLabelText("Email"))
    await user.type(screen.getByLabelText("Email"), "ADA@example.com")
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText("First name"))
    await user.type(screen.getByLabelText("First name"), "Augusta")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(updateProfile).toHaveBeenCalledOnce())
    expect(Object.fromEntries(updateProfile.mock.calls[0][1].entries())).toEqual({
      firstName: "Augusta",
      lastName: "Lovelace",
      email: "ADA@example.com",
    })
    expect(await screen.findByLabelText("First name")).toHaveValue("Augusta")
  })

  it("asks for the current password once the email changes and posts it", async () => {
    const user = userEvent.setup()
    updateProfile.mockResolvedValue({ success: true, values: { ...profile, email: "ada@lovelace.dev" } })
    render(<ProfileForm profile={profile} />)

    await user.clear(screen.getByLabelText("Email"))
    await user.type(screen.getByLabelText("Email"), "ada@lovelace.dev")
    const password = screen.getByLabelText("Current password")
    expect(password).toHaveAttribute("type", "password")
    expect(password).toHaveAccessibleDescription("Confirm it's you to change your email.")
    await user.type(password, "secret123")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(updateProfile).toHaveBeenCalledOnce())
    expect(updateProfile.mock.calls[0][1].get("currentPassword")).toBe("secret123")
    // Saved: the new email is now the stored one, so the password field goes away.
    await waitFor(() => expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument())
    expect(screen.getByLabelText("Email")).toHaveValue("ada@lovelace.dev")
  })

  it("shows field errors inline, keeps the typed values and never refills the password", async () => {
    const user = userEvent.setup()
    updateProfile.mockResolvedValue({
      errors: {
        email: ["An account with this email already exists."],
        currentPassword: ["Your current password is incorrect."],
      },
      values: { firstName: "Augusta", lastName: "Lovelace", email: "taken@example.com" },
    })
    render(<ProfileForm profile={profile} />)

    await user.clear(screen.getByLabelText("Email"))
    await user.type(screen.getByLabelText("Email"), "taken@example.com")
    await user.type(screen.getByLabelText("Current password"), "wrong-pass1")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    // The form remounts with the action's values, so query the field afresh once it has.
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true"))
    const email = screen.getByLabelText("Email")
    expect(email).toHaveValue("taken@example.com")
    expect(email).toHaveAccessibleDescription("An account with this email already exists.")
    expect(screen.getByLabelText("First name")).toHaveValue("Augusta")
    expect(screen.getByLabelText("First name")).not.toHaveAttribute("aria-invalid")
    const password = screen.getByLabelText("Current password")
    expect(password).toHaveValue("")
    expect(password).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("Your current password is incorrect.")).toBeInTheDocument()
  })

  it("shows a form-level message", async () => {
    const user = userEvent.setup()
    updateProfile.mockResolvedValue({ message: "Something went wrong. Please try again.", values: profile })
    render(<ProfileForm profile={profile} />)

    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.")
  })
})

describe("PasswordForm", () => {
  async function submit(current: string, next: string, confirm: string) {
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Current password"), current)
    await user.type(screen.getByLabelText("New password"), next)
    await user.type(screen.getByLabelText("Confirm new password"), confirm)
    await user.click(screen.getByRole("button", { name: "Change password" }))
  }

  it("posts the three fields", async () => {
    changePassword.mockResolvedValue({ success: true })
    render(<PasswordForm />)

    await submit("old-pass1", "new-pass2", "new-pass2")

    await waitFor(() => expect(changePassword).toHaveBeenCalledOnce())
    expect(Object.fromEntries(changePassword.mock.calls[0][1].entries())).toEqual({
      currentPassword: "old-pass1",
      newPassword: "new-pass2",
      confirmPassword: "new-pass2",
    })
  })

  it("shows every strength rule that failed and clears all password fields", async () => {
    changePassword.mockResolvedValue({
      errors: {
        currentPassword: ["Your current password is incorrect."],
        newPassword: ["Be at least 8 characters long.", "Contain at least one number."],
      },
    })
    render(<PasswordForm />)

    await submit("wrong-pass1", "short", "short")

    expect(await screen.findByText("Your current password is incorrect.")).toBeInTheDocument()
    expect(screen.getByText("Be at least 8 characters long.")).toBeInTheDocument()
    expect(screen.getByText("Contain at least one number.")).toBeInTheDocument()
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("New password")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Confirm new password")).not.toHaveAttribute("aria-invalid")
    for (const label of ["Current password", "New password", "Confirm new password"]) {
      expect(screen.getByLabelText(label)).toHaveValue("")
    }
  })
})

describe("AccountNav", () => {
  it.each([
    ["/account", "Overview"],
    ["/account/addresses", "Addresses"],
    ["/account/orders", "Orders"],
  ])("marks the section for %s as current", (path, label) => {
    pathname.current = path
    render(<AccountNav />)

    const nav = screen.getByRole("navigation", { name: "Account" })
    const links = Array.from(nav.querySelectorAll("a"))
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Overview", "/account"],
      ["Orders", "/account/orders"],
      ["Wishlist", "/account/wishlist"],
      ["Profile", "/account/profile"],
      ["Addresses", "/account/addresses"],
      ["Security", "/account/security"],
    ])
    expect(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.textContent)).toEqual([
      label,
    ])
  })
})
