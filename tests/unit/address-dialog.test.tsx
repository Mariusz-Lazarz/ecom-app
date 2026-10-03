import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AddressFormState } from "@/lib/validation/addresses"

const saveAddress = vi.fn<(state: AddressFormState, formData: FormData) => Promise<AddressFormState>>()
vi.mock("@/app/actions/addresses", () => ({
  saveAddress: (state: AddressFormState, formData: FormData) => saveAddress(state, formData),
}))
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("@/lib/notify", () => ({ notify }))

const { AddressDialog } = await import("@/components/addresses/address-dialog")

const office = {
  id: "6a1d7b3f-4c2e-4d8f-8b9c-1d2e3f4a5b6c",
  label: "Office",
  fullName: "Ada Lovelace",
  line1: "1 Engine Street",
  line2: null,
  city: "London",
  postalCode: "EC1A 1BB",
  country: "GB",
  phone: "+44 20 7946 0958",
  isDefault: false,
}

beforeEach(() => {
  saveAddress.mockReset()
  notify.success.mockReset()
})

describe("AddressDialog", () => {
  it("adds an address starting from the defaults, then closes with a toast", async () => {
    const user = userEvent.setup()
    saveAddress.mockResolvedValue({ success: true })
    render(<AddressDialog defaults={{ fullName: "Ada Lovelace" }} />)

    await user.click(screen.getByRole("button", { name: "Add address" }))
    const dialog = await screen.findByRole("dialog", { name: "Add an address" })
    expect(within(dialog).getByLabelText("Full name")).toHaveValue("Ada Lovelace")
    await user.type(within(dialog).getByLabelText("Label"), "Home")
    await user.type(within(dialog).getByLabelText("Address"), "12 Analytical Row")
    await user.type(within(dialog).getByLabelText("City"), "London")
    await user.type(within(dialog).getByLabelText("Postal code"), "EC1A 1BB")
    await user.type(within(dialog).getByLabelText("Phone"), "+44 20 7946 0958")
    await user.click(within(dialog).getByRole("button", { name: "Save address" }))

    await waitFor(() => expect(saveAddress).toHaveBeenCalledOnce())
    expect(Object.fromEntries(saveAddress.mock.calls[0][1].entries())).toEqual({
      label: "Home",
      fullName: "Ada Lovelace",
      line1: "12 Analytical Row",
      line2: "",
      city: "London",
      postalCode: "EC1A 1BB",
      country: "US",
      phone: "+44 20 7946 0958",
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(notify.success).toHaveBeenCalledExactlyOnceWith("Address saved")
  })

  it("edits an address prefilled from it, posting its id", async () => {
    const user = userEvent.setup()
    saveAddress.mockResolvedValue({ success: true })
    render(<AddressDialog address={office} />)

    await user.click(screen.getByRole("button", { name: "Edit Office" }))
    const dialog = await screen.findByRole("dialog", { name: "Edit Office" })
    expect(within(dialog).getByLabelText("Label")).toHaveValue("Office")
    expect(within(dialog).getByLabelText("Address")).toHaveValue("1 Engine Street")
    expect(within(dialog).getByRole("combobox", { name: "Country" })).toHaveTextContent("United Kingdom")
    await user.click(within(dialog).getByRole("button", { name: "Save address" }))

    await waitFor(() => expect(saveAddress).toHaveBeenCalledOnce())
    expect(saveAddress.mock.calls[0][1].get("id")).toBe(office.id)
    expect(saveAddress.mock.calls[0][1].get("country")).toBe("GB")
    expect(notify.success).toHaveBeenCalledExactlyOnceWith("Address updated")
  })

  it("keeps the dialog open with field errors and the typed values after a failed save", async () => {
    const user = userEvent.setup()
    saveAddress.mockResolvedValue({
      message: "Please check the highlighted fields.",
      errors: { label: ["Label is required."], phone: ["Please enter a valid phone number."] },
      values: { label: "", fullName: "Ada Lovelace", line1: "1 Engine Street", city: "London", phone: "call me" },
    })
    render(<AddressDialog address={office} />)

    await user.click(screen.getByRole("button", { name: "Edit Office" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Save address" }))

    expect(await within(dialog).findByText("Label is required.")).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Label")).toHaveAttribute("aria-invalid", "true")
    expect(within(dialog).getByLabelText("Phone")).toHaveValue("call me")
    expect(within(dialog).getByLabelText("Phone")).toHaveAccessibleDescription("Please enter a valid phone number.")
    expect(within(dialog).getByLabelText("City")).toHaveValue("London")
    expect(within(dialog).getByLabelText("City")).not.toHaveAttribute("aria-invalid")
    expect(within(dialog).getByText("Please check the highlighted fields.")).toBeInTheDocument()
    expect(notify.success).not.toHaveBeenCalled()
  })

  it("can't be opened at the limit", () => {
    render(<AddressDialog disabled />)
    expect(screen.getByRole("button", { name: "Add address" })).toBeDisabled()
  })
})
