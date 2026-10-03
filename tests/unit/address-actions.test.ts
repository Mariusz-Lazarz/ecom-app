import { beforeEach, describe, expect, it, vi } from "vitest"

import { ConflictError, NotFoundError } from "@/lib/errors"

const session = vi.hoisted(() => ({ current: null as null | { user: { id?: string } } }))
const addresses = vi.hoisted(() => ({
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
  setDefaultAddress: vi.fn(),
}))
const refresh = vi.fn()
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
})

vi.mock("@/auth", () => ({ auth: async () => session.current }))
vi.mock("@/lib/addresses", () => addresses)
vi.mock("next/cache", () => ({ refresh: () => refresh() }))
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }))

const { saveAddress, deleteAddress, setDefaultAddress } = await import("@/app/actions/addresses")

const USER_ID = "8d3c1f7a-1b2c-4d5e-8f90-a1b2c3d4e5f6"
const ADDRESS_ID = "5f0c6a2e-3b1d-4c7e-9a8b-0c1d2e3f4a5b"
const asUser = () => (session.current = { user: { id: USER_ID } })

const fields = {
  label: " Office ",
  fullName: "Ada Lovelace",
  line1: "12 Analytical Row",
  line2: "",
  city: "London",
  postalCode: "ec1a 1bb",
  country: "gb",
  phone: "+44 20 7946 0958",
}
const parsed = {
  label: "Office",
  fullName: "Ada Lovelace",
  line1: "12 Analytical Row",
  line2: null,
  city: "London",
  postalCode: "EC1A 1BB",
  country: "GB",
  phone: "+44 20 7946 0958",
}

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

beforeEach(() => {
  session.current = null
  for (const fn of Object.values(addresses)) fn.mockReset()
  refresh.mockReset()
  redirect.mockClear()
})

describe("saveAddress action", () => {
  it("sends signed-out visitors to /login without saving", async () => {
    await expect(saveAddress(undefined, form(fields))).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/login;307;",
    })
    expect(addresses.createAddress).not.toHaveBeenCalled()
  })

  it("adds a new address for the session user and refreshes", async () => {
    asUser()
    addresses.createAddress.mockResolvedValue({ id: ADDRESS_ID })

    const state = await saveAddress(undefined, form({ ...fields, userId: "someone-else" }))

    expect(state).toEqual({ success: true })
    expect(addresses.createAddress).toHaveBeenCalledExactlyOnceWith(USER_ID, parsed)
    expect(addresses.updateAddress).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("edits the address named by the form's id", async () => {
    asUser()
    addresses.updateAddress.mockResolvedValue({ id: ADDRESS_ID })

    const state = await saveAddress(undefined, form({ ...fields, id: ADDRESS_ID }))

    expect(state).toEqual({ success: true })
    expect(addresses.updateAddress).toHaveBeenCalledExactlyOnceWith(USER_ID, ADDRESS_ID, parsed)
    expect(addresses.createAddress).not.toHaveBeenCalled()
  })

  it("returns field errors and the typed values for an invalid form", async () => {
    asUser()

    const state = await saveAddress(undefined, form({ ...fields, label: "", city: "", country: "JP" }))

    expect(state).toEqual({
      message: "Please check the highlighted fields.",
      errors: {
        label: ["Label is required."],
        city: ["City is required."],
        country: ["We don't ship to this country."],
      },
      values: { ...fields, label: "", city: "", country: "JP" },
    })
    expect(addresses.createAddress).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("refuses a malformed id as not found without touching the database", async () => {
    asUser()

    const state = await saveAddress(undefined, form({ ...fields, id: "42" }))

    expect(state).toEqual({ message: "Address not found.", values: fields })
    expect(addresses.updateAddress).not.toHaveBeenCalled()
  })

  it.each([
    ["the limit", new ConflictError("You can save up to 10 addresses. Delete one to add another."), {}],
    ["someone else's address", new NotFoundError("Address not found."), { id: ADDRESS_ID }],
  ])("reports %s as a message with the values kept", async (_case, error, extra) => {
    asUser()
    addresses.createAddress.mockRejectedValue(error)
    addresses.updateAddress.mockRejectedValue(error)

    const state = await saveAddress(undefined, form({ ...fields, ...extra }))

    expect(state).toEqual({ message: error.message, values: fields })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("hides unexpected errors behind a generic message", async () => {
    asUser()
    addresses.createAddress.mockRejectedValue(new Error("connection reset"))

    const state = await saveAddress(undefined, form(fields))

    expect(state).toEqual({ message: "Something went wrong. Please try again.", values: fields })
  })
})

describe.each([
  ["deleteAddress", deleteAddress, addresses.deleteAddress],
  ["setDefaultAddress", setDefaultAddress, addresses.setDefaultAddress],
] as const)("%s action", (_name, action, domain) => {
  it("sends signed-out visitors to /login", async () => {
    await expect(action(ADDRESS_ID)).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/login;307;" })
    expect(domain).not.toHaveBeenCalled()
  })

  it("acts on the session user's address and refreshes", async () => {
    asUser()
    domain.mockResolvedValue(undefined)

    expect(await action(ADDRESS_ID)).toEqual({ ok: true })
    expect(domain).toHaveBeenCalledExactlyOnceWith(USER_ID, ADDRESS_ID)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("treats a malformed id as not found", async () => {
    asUser()

    expect(await action("nope")).toEqual({ ok: false, message: "Address not found." })
    expect(domain).not.toHaveBeenCalled()
  })

  it("maps a missing or foreign address to its message, and unexpected errors to a generic one", async () => {
    asUser()
    domain.mockRejectedValueOnce(new NotFoundError("Address not found."))
    expect(await action(ADDRESS_ID)).toEqual({ ok: false, message: "Address not found." })

    domain.mockRejectedValueOnce(new Error("boom"))
    expect(await action(ADDRESS_ID)).toEqual({ ok: false, message: "Something went wrong. Please try again." })
    expect(refresh).not.toHaveBeenCalled()
  })
})
