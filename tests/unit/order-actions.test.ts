import { beforeEach, describe, expect, it, vi } from "vitest"

import { ConflictError, NotFoundError } from "@/lib/errors"

const session = vi.hoisted(() => ({ current: null as null | { user: { id?: string; role: "user" | "admin" } } }))
const orders = vi.hoisted(() => ({
  placeOrder: vi.fn(),
  cancelOrderAsCustomer: vi.fn(),
  changeOrderStatus: vi.fn(),
}))
const addresses = vi.hoisted(() => ({
  getAddress: vi.fn(),
  listAddresses: vi.fn(),
  createAddress: vi.fn(),
}))
const flash = vi.fn()
const refresh = vi.fn()
const revalidatePath = vi.fn()
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
})

vi.mock("@/auth", () => ({ auth: async () => session.current }))
vi.mock("@/lib/orders", () => orders)
vi.mock("@/lib/addresses", () => addresses)
vi.mock("@/lib/flash", () => ({ flash: (...args: unknown[]) => flash(...args) }))
vi.mock("next/cache", () => ({
  refresh: () => refresh(),
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }))

const { placeOrder, cancelOrder, changeOrderStatus } = await import("@/app/actions/orders")

const USER_ID = "8d3c1f7a-1b2c-4d5e-8f90-a1b2c3d4e5f6"
const ADMIN_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
const asGuest = () => (session.current = null)
const asUser = () => (session.current = { user: { id: USER_ID, role: "user" } })
const asAdmin = () => (session.current = { user: { id: ADMIN_ID, role: "admin" } })

const address = {
  fullName: "Ada Lovelace",
  line1: "12 Analytical Row",
  line2: "",
  city: "London",
  postalCode: "ec1a 1bb",
  country: "GB",
  phone: "+44 20 7946 0958",
  shippingMethodId: "standard",
  paymentMethodId: "wallets",
}

function form(fields: Record<string, string | undefined>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) data.set(key, value)
  return data
}

beforeEach(() => {
  asGuest()
  for (const fn of Object.values(orders)) fn.mockReset()
  for (const fn of Object.values(addresses)) fn.mockReset()
  flash.mockReset()
  refresh.mockReset()
  revalidatePath.mockReset()
  redirect.mockClear()
})

describe("placeOrder action", () => {
  it("sends signed-out visitors to /login without placing anything", async () => {
    await expect(placeOrder(undefined, form(address))).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/login;307;" })
    expect(orders.placeOrder).not.toHaveBeenCalled()
  })

  it("places the order for the session's user, queues a toast and redirects to it", async () => {
    asUser()
    orders.placeOrder.mockResolvedValue({ id: "order-1", number: "NC-10042" })

    await expect(placeOrder(undefined, form({ ...address, userId: "someone-else" }))).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/orders/NC-10042;307;",
    })

    expect(orders.placeOrder).toHaveBeenCalledExactlyOnceWith(USER_ID, {
      ...address,
      line2: null,
      postalCode: "EC1A 1BB",
    })
    expect(flash).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: "Order placed",
      description: "Thanks! Your order NC-10042 is confirmed.",
    })
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout")
  })

  it("returns field errors and the typed values for an invalid form", async () => {
    asUser()

    const state = await placeOrder(undefined, form({ ...address, city: "", country: "JP", shippingMethodId: "drone" }))

    expect(state).toEqual({
      message: "Please check the highlighted fields.",
      errors: {
        city: ["City is required."],
        country: ["We don't ship to this country."],
        shippingMethodId: ["Choose a shipping method."],
      },
      values: { ...address, city: "", country: "JP", shippingMethodId: "drone" },
    })
    expect(orders.placeOrder).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("returns an expected failure's message and refreshes the page", async () => {
    asUser()
    orders.placeOrder.mockRejectedValue(new ConflictError("Some items in your cart aren't available: Lamp (out of stock)."))

    const state = await placeOrder(undefined, form(address))

    expect(state).toEqual({
      message: "Some items in your cart aren't available: Lamp (out of stock).",
      values: address,
    })
    expect(refresh).toHaveBeenCalledOnce()
    expect(flash).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("hides unexpected errors behind a generic message", async () => {
    asUser()
    orders.placeOrder.mockRejectedValue(new Error("connection reset: secret details"))

    const state = await placeOrder(undefined, form(address))

    expect(state?.message).toBe("Something went wrong. Please try again.")
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe("placeOrder action with saved addresses", () => {
  const ADDRESS_ID = "5f0c6a2e-3b1d-4c7e-9a8b-0c1d2e3f4a5b"
  const saved = {
    id: ADDRESS_ID,
    label: "Home",
    fullName: "Grace Hopper",
    line1: "1 Navy Way",
    line2: null,
    city: "Arlington",
    postalCode: "22202",
    country: "US",
    phone: "+1 703 555 0100",
    isDefault: true,
  }
  const methods = { shippingMethodId: "standard", paymentMethodId: "wallets" }

  it("ships to the picked saved address, ignoring any posted address fields", async () => {
    asUser()
    addresses.getAddress.mockResolvedValue(saved)
    orders.placeOrder.mockResolvedValue({ id: "order-1", number: "NC-10042" })

    await expect(
      placeOrder(undefined, form({ ...address, addressId: ADDRESS_ID, saveAddress: "on" })),
    ).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/orders/NC-10042;307;" })

    expect(addresses.getAddress).toHaveBeenCalledExactlyOnceWith(USER_ID, ADDRESS_ID)
    expect(orders.placeOrder).toHaveBeenCalledExactlyOnceWith(USER_ID, {
      fullName: "Grace Hopper",
      line1: "1 Navy Way",
      line2: null,
      city: "Arlington",
      postalCode: "22202",
      country: "US",
      phone: "+1 703 555 0100",
      ...methods,
    })
    // An existing address is never saved again, even with the checkbox posted.
    expect(addresses.createAddress).not.toHaveBeenCalled()
    expect(flash).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: "Order placed",
      description: "Thanks! Your order NC-10042 is confirmed.",
    })
  })

  it.each([
    ["someone else's or a deleted address", ADDRESS_ID, 1],
    ["a malformed id", "not-a-uuid", 0],
  ])("refuses %s without placing the order", async (_case, addressId, lookups) => {
    asUser()
    addresses.getAddress.mockResolvedValue(null)

    const state = await placeOrder(undefined, form({ ...methods, addressId }))

    const message = "That address is no longer saved. Pick another one or enter a new address."
    expect(state).toEqual({ errors: { addressId: [message] }, message, values: { ...methods, addressId } })
    expect(addresses.getAddress).toHaveBeenCalledTimes(lookups)
    expect(orders.placeOrder).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("uses the posted fields for a new address and doesn't save it without the checkbox", async () => {
    asUser()
    orders.placeOrder.mockResolvedValue({ id: "order-1", number: "NC-10042" })

    await expect(placeOrder(undefined, form({ ...address, addressId: "new" }))).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/orders/NC-10042;307;",
    })

    expect(addresses.getAddress).not.toHaveBeenCalled()
    expect(orders.placeOrder).toHaveBeenCalledExactlyOnceWith(USER_ID, { ...address, line2: null, postalCode: "EC1A 1BB" })
    expect(addresses.createAddress).not.toHaveBeenCalled()
  })

  it.each([
    ["Home for the first saved address", [], "Home"],
    ["the city for later ones", [saved], "London"],
  ])("saves a new address after the order when asked, labelled %s", async (_case, existing, label) => {
    asUser()
    orders.placeOrder.mockResolvedValue({ id: "order-1", number: "NC-10042" })
    addresses.listAddresses.mockResolvedValue(existing)
    addresses.createAddress.mockResolvedValue({})

    await expect(placeOrder(undefined, form({ ...address, addressId: "new", saveAddress: "on" }))).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/orders/NC-10042;307;",
    })

    expect(addresses.createAddress).toHaveBeenCalledExactlyOnceWith(USER_ID, {
      label,
      fullName: "Ada Lovelace",
      line1: "12 Analytical Row",
      line2: null,
      city: "London",
      postalCode: "EC1A 1BB",
      country: "GB",
      phone: "+44 20 7946 0958",
    })
    expect(orders.placeOrder.mock.invocationCallOrder[0]).toBeLessThan(addresses.createAddress.mock.invocationCallOrder[0])
    expect(flash).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: "Order placed",
      description: "Thanks! Your order NC-10042 is confirmed. The address was saved to your account.",
    })
  })

  it("keeps the order when saving the address fails, and says why in the toast", async () => {
    asUser()
    orders.placeOrder.mockResolvedValue({ id: "order-1", number: "NC-10042" })
    addresses.listAddresses.mockResolvedValue([saved])
    addresses.createAddress.mockRejectedValue(new ConflictError("You can save up to 10 addresses. Delete one to add another."))

    await expect(placeOrder(undefined, form({ ...address, saveAddress: "on" }))).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/orders/NC-10042;307;",
    })

    expect(flash).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: "Order placed",
      description:
        "Thanks! Your order NC-10042 is confirmed. We couldn't save the address: You can save up to 10 addresses. Delete one to add another.",
    })
  })

  it("doesn't save the address when the order fails", async () => {
    asUser()
    orders.placeOrder.mockRejectedValue(new ConflictError("Your cart is empty."))

    const state = await placeOrder(undefined, form({ ...address, saveAddress: "on" }))

    expect(state).toEqual({ message: "Your cart is empty.", values: { ...address, saveAddress: "on" } })
    expect(addresses.createAddress).not.toHaveBeenCalled()
  })
})

describe("cancelOrder action", () => {
  it("sends signed-out visitors to /login", async () => {
    await expect(cancelOrder("NC-10001")).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/login;307;" })
    expect(orders.cancelOrderAsCustomer).not.toHaveBeenCalled()
  })

  it("cancels the session user's order and refreshes", async () => {
    asUser()
    orders.cancelOrderAsCustomer.mockResolvedValue({
      number: "NC-10001",
      status: "cancelled",
      previousStatus: "pending",
      trackingNumber: null,
    })

    expect(await cancelOrder(" nc-10001 ")).toEqual({
      ok: true,
      message: "Order NC-10001 has been cancelled.",
      order: { number: "NC-10001", status: "cancelled", trackingNumber: null },
    })
    expect(orders.cancelOrderAsCustomer).toHaveBeenCalledExactlyOnceWith(USER_ID, "NC-10001")
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("maps domain errors to messages and doesn't refresh", async () => {
    asUser()
    orders.cancelOrderAsCustomer.mockRejectedValueOnce(new NotFoundError("Order not found."))
    expect(await cancelOrder("NC-10001")).toEqual({ ok: false, message: "Order not found." })

    orders.cancelOrderAsCustomer.mockRejectedValueOnce(new ConflictError("This order is already shipped."))
    expect(await cancelOrder("NC-10001")).toEqual({ ok: false, message: "This order is already shipped." })

    orders.cancelOrderAsCustomer.mockRejectedValueOnce(new TypeError("boom"))
    expect(await cancelOrder("NC-10001")).toEqual({ ok: false, message: "Something went wrong. Please try again." })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("treats a malformed number as not found without calling the domain", async () => {
    asUser()
    expect(await cancelOrder("drop table")).toEqual({ ok: false, message: "Order not found." })
    expect(orders.cancelOrderAsCustomer).not.toHaveBeenCalled()
  })
})

describe("changeOrderStatus action", () => {
  const shipped = { number: "NC-10001", status: "shipped", previousStatus: "processing", trackingNumber: "1Z999" }

  it("sends signed-out visitors to /login", async () => {
    await expect(changeOrderStatus("NC-10001", { status: "processing" })).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/login;307;",
    })
    expect(orders.changeOrderStatus).not.toHaveBeenCalled()
  })

  it("refuses non-admins", async () => {
    asUser()
    expect(await changeOrderStatus("NC-10001", { status: "cancelled" })).toEqual({
      ok: false,
      message: "You don't have access to this action.",
    })
    expect(orders.changeOrderStatus).not.toHaveBeenCalled()
  })

  it("applies an admin's change as the admin and refreshes", async () => {
    asAdmin()
    orders.changeOrderStatus.mockResolvedValue(shipped)

    const result = await changeOrderStatus("nc-10001", { status: "shipped", trackingNumber: "1Z999", note: "" })

    expect(orders.changeOrderStatus).toHaveBeenCalledExactlyOnceWith(
      "NC-10001",
      { status: "shipped", trackingNumber: "1Z999", note: undefined },
      { userId: ADMIN_ID, role: "admin" },
    )
    expect(result).toEqual({
      ok: true,
      message: "Order NC-10001 is now shipped.",
      order: { number: "NC-10001", status: "shipped", trackingNumber: "1Z999" },
    })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("reads FormData directly and as useActionState's (state, formData)", async () => {
    asAdmin()
    orders.changeOrderStatus.mockResolvedValue(shipped)

    await changeOrderStatus("NC-10001", form({ status: "processing", note: "Packed" }))
    await changeOrderStatus("NC-10001", { ok: true }, form({ status: "shipped", trackingNumber: "1Z999" }))

    expect(orders.changeOrderStatus.mock.calls.map((call) => call[1])).toEqual([
      { status: "processing", note: "Packed", trackingNumber: undefined },
      { status: "shipped", note: undefined, trackingNumber: "1Z999" },
    ])
  })

  it("returns field errors for an invalid change", async () => {
    asAdmin()
    expect(await changeOrderStatus("NC-10001", { status: "delivered", trackingNumber: "1Z999" })).toEqual({
      ok: false,
      message: "Please check the status change.",
      errors: { trackingNumber: ["A tracking number can only be set when the order ships."] },
    })
    expect(orders.changeOrderStatus).not.toHaveBeenCalled()
  })

  it("maps a refused transition and unexpected errors to messages", async () => {
    asAdmin()
    orders.changeOrderStatus.mockRejectedValueOnce(new ConflictError("This order is delivered and can't be changed to cancelled."))
    expect(await changeOrderStatus("NC-10001", { status: "cancelled" })).toEqual({
      ok: false,
      message: "This order is delivered and can't be changed to cancelled.",
    })

    orders.changeOrderStatus.mockRejectedValueOnce(new Error("deadlock detected"))
    expect(await changeOrderStatus("NC-10001", { status: "cancelled" })).toEqual({
      ok: false,
      message: "Something went wrong. Please try again.",
    })
    expect(refresh).not.toHaveBeenCalled()
  })
})
