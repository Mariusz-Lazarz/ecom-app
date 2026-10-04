import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeOrderDetail } from "./fixtures/orders"

// Which email each action sends, to whom, and that a failing email never fails the action. The real
// mailer runs (src/lib/mail.ts); only the SMTP transport and `after()` are faked, so the queued
// emails are sent when the test runs the `after` callbacks.
vi.mock("server-only", () => ({}))

const transport = vi.hoisted(() => ({ sendMail: vi.fn() }))
vi.mock("nodemailer", () => ({ default: { createTransport: () => transport } }))

const afterQueue = vi.hoisted(() => [] as (() => Promise<void>)[])
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => void afterQueue.push(callback) }))

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: "user" | "admin" } } }))
const orders = vi.hoisted(() => ({
  placeOrder: vi.fn(),
  cancelOrderAsCustomer: vi.fn(),
  changeOrderStatus: vi.fn(),
  getOrder: vi.fn(),
}))
const createUser = vi.hoisted(() => vi.fn())

vi.mock("@/auth", () => ({ auth: async () => session.current }))
vi.mock("@/lib/orders", () => orders)
vi.mock("@/lib/addresses", () => ({ getAddress: vi.fn(), listAddresses: vi.fn(), createAddress: vi.fn() }))
vi.mock("@/lib/users", () => ({ createUser, EmailTakenError: class EmailTakenError extends Error {} }))
vi.mock("@/lib/flash", () => ({ flash: vi.fn() }))
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
  },
}))

const { placeOrder, cancelOrder, changeOrderStatus } = await import("@/app/actions/orders")
const { register } = await import("@/app/actions/register")

const USER_ID = "8d3c1f7a-1b2c-4d5e-8f90-a1b2c3d4e5f6"
const ADMIN_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"

const savedEnv = { SMTP_HOST: process.env.SMTP_HOST, SMTP_PORT: process.env.SMTP_PORT, APP_URL: process.env.APP_URL }

beforeEach(() => {
  Object.assign(process.env, { SMTP_HOST: "localhost", SMTP_PORT: "1025", APP_URL: "https://shop.example" })
  ;(globalThis as { mailTransport?: unknown }).mailTransport = undefined
  transport.sendMail.mockReset().mockResolvedValue({ messageId: "<id>" })
  for (const fn of Object.values(orders)) fn.mockReset()
  createUser.mockReset()
  afterQueue.length = 0
  session.current = null
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.restoreAllMocks()
})

async function sentEmails() {
  for (const callback of afterQueue.splice(0)) await callback()
  return transport.sendMail.mock.calls.map(([mail]) => mail as { to: string; subject: string; html: string; text: string })
}

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const CHECKOUT = {
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

describe("registration", () => {
  it("sends the welcome email to the new account after the response", async () => {
    createUser.mockResolvedValue({ id: "u1", email: "jan@example.com" })

    const state = await register(
      undefined,
      form({ firstName: "Jan", lastName: "Kowalski", email: "Jan@Example.com", password: "secret123", confirmPassword: "secret123" }),
    )

    expect(state).toEqual({ success: true, firstName: "Jan" })
    expect(transport.sendMail).not.toHaveBeenCalled()
    const [mail, ...rest] = await sentEmails()
    expect(rest).toHaveLength(0)
    expect(mail).toMatchObject({ to: "jan@example.com", subject: "Welcome to Northcart" })
    expect(mail.text).toContain("Welcome aboard, Jan!")
  })

  it("sends nothing when registration fails", async () => {
    createUser.mockRejectedValue(new Error("db down"))
    await register(
      undefined,
      form({ firstName: "Jan", lastName: "K", email: "jan@example.com", password: "secret123", confirmPassword: "secret123" }),
    )
    expect(await sentEmails()).toEqual([])
  })

  it("still succeeds when the email can't be sent", async () => {
    createUser.mockResolvedValue({ id: "u1", email: "jan@example.com" })
    transport.sendMail.mockRejectedValue(new Error("SMTP down"))

    const state = await register(
      undefined,
      form({ firstName: "Jan", lastName: "K", email: "jan@example.com", password: "secret123", confirmPassword: "secret123" }),
    )

    expect(state).toEqual({ success: true, firstName: "Jan" })
    await expect(sentEmails()).resolves.toHaveLength(1)
  })
})

describe("placing an order", () => {
  it("emails the confirmation for the placed order to its customer", async () => {
    session.current = { user: { id: USER_ID, role: "user" } }
    orders.placeOrder.mockResolvedValue({ id: "o1", number: "NC-10042" })
    orders.getOrder.mockResolvedValue(
      makeOrderDetail({ number: "NC-10042", customer: { id: USER_ID, name: "Ada Lovelace", email: "ada@example.com" } }),
    )

    await expect(placeOrder(undefined, form(CHECKOUT))).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/orders/NC-10042;307;" })

    const [mail, ...rest] = await sentEmails()
    expect(rest).toHaveLength(0)
    expect(orders.getOrder).toHaveBeenCalledWith("NC-10042")
    expect(mail).toMatchObject({ to: "ada@example.com", subject: "Order NC-10042 confirmed" })
    expect(mail.text).toContain("https://shop.example/orders/NC-10042")
  })

  it("sends nothing when the order fails", async () => {
    session.current = { user: { id: USER_ID, role: "user" } }
    orders.placeOrder.mockRejectedValue(new Error("db down"))

    const state = await placeOrder(undefined, form(CHECKOUT))

    expect(state).toMatchObject({ message: "Something went wrong. Please try again." })
    expect(await sentEmails()).toEqual([])
  })

  it("still redirects to the order when reading it for the email fails", async () => {
    session.current = { user: { id: USER_ID, role: "user" } }
    orders.placeOrder.mockResolvedValue({ id: "o1", number: "NC-10042" })
    orders.getOrder.mockRejectedValue(new Error("db down"))

    await expect(placeOrder(undefined, form(CHECKOUT))).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/orders/NC-10042;307;" })
    expect(await sentEmails()).toEqual([])
  })
})

describe("status changes", () => {
  const shipped = makeOrderDetail({
    number: "NC-10050",
    status: "shipped",
    trackingNumber: "1Z-TRACK",
    customer: { id: USER_ID, name: "Ada Lovelace", email: "ada@example.com" },
  })

  it("emails the order's customer (not the admin) about an admin's change, with tracking and note", async () => {
    session.current = { user: { id: ADMIN_ID, role: "admin" } }
    orders.changeOrderStatus.mockResolvedValue({
      number: "NC-10050",
      status: "shipped",
      previousStatus: "processing",
      trackingNumber: "1Z-TRACK",
    })
    orders.getOrder.mockResolvedValue(shipped)

    const result = await changeOrderStatus("NC-10050", { status: "shipped", trackingNumber: "1Z-TRACK", note: "Left our warehouse." })

    expect(result.ok).toBe(true)
    const [mail, ...rest] = await sentEmails()
    expect(rest).toHaveLength(0)
    expect(mail).toMatchObject({ to: "ada@example.com", subject: "Order NC-10050 is on its way" })
    expect(mail.text).toContain("Tracking number: 1Z-TRACK")
    expect(mail.text).toContain("A note from us:\nLeft our warehouse.")
  })

  it("passes a rejection's note to the email", async () => {
    session.current = { user: { id: ADMIN_ID, role: "admin" } }
    orders.changeOrderStatus.mockResolvedValue({ number: "NC-10050", status: "rejected", previousStatus: "pending", trackingNumber: null })
    orders.getOrder.mockResolvedValue({ ...shipped, status: "rejected", trackingNumber: null })

    await changeOrderStatus("NC-10050", { status: "rejected", note: "Address unreachable." })

    const [mail] = await sentEmails()
    expect(mail.subject).toBe("We couldn't accept order NC-10050")
    expect(mail.text).toContain("Address unreachable.")
  })

  it("sends nothing for a refused change or a non-admin", async () => {
    session.current = { user: { id: ADMIN_ID, role: "admin" } }
    orders.changeOrderStatus.mockRejectedValue(new Error("boom"))
    expect((await changeOrderStatus("NC-10050", { status: "processing" })).ok).toBe(false)

    session.current = { user: { id: USER_ID, role: "user" } }
    expect((await changeOrderStatus("NC-10050", { status: "processing" })).ok).toBe(false)

    expect(await sentEmails()).toEqual([])
  })

  it("keeps the change when the email fails to send", async () => {
    session.current = { user: { id: ADMIN_ID, role: "admin" } }
    orders.changeOrderStatus.mockResolvedValue({ number: "NC-10050", status: "delivered", previousStatus: "shipped", trackingNumber: null })
    orders.getOrder.mockResolvedValue(shipped)
    transport.sendMail.mockRejectedValue(new Error("SMTP down"))

    const result = await changeOrderStatus("NC-10050", { status: "delivered" })

    expect(result).toMatchObject({ ok: true, message: "Order NC-10050 is now delivered." })
    await expect(sentEmails()).resolves.toHaveLength(1)
  })

  it("confirms a customer's own cancellation to them", async () => {
    session.current = { user: { id: USER_ID, role: "user" } }
    orders.cancelOrderAsCustomer.mockResolvedValue({
      number: "NC-10050",
      status: "cancelled",
      previousStatus: "pending",
      trackingNumber: null,
    })
    orders.getOrder.mockResolvedValue({ ...shipped, status: "cancelled" })

    const result = await cancelOrder("NC-10050")

    expect(result.ok).toBe(true)
    const [mail, ...rest] = await sentEmails()
    expect(rest).toHaveLength(0)
    expect(mail).toMatchObject({ to: "ada@example.com", subject: "You cancelled order NC-10050" })
  })

  it("sends nothing when the order is gone by the time the email is built", async () => {
    session.current = { user: { id: USER_ID, role: "user" } }
    orders.cancelOrderAsCustomer.mockResolvedValue({ number: "NC-10050", status: "cancelled", previousStatus: "pending", trackingNumber: null })
    orders.getOrder.mockResolvedValue(null)

    expect((await cancelOrder("NC-10050")).ok).toBe(true)
    expect(await sentEmails()).toEqual([])
  })
})
