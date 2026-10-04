import { beforeEach, describe, expect, it, vi } from "vitest"

// The contact Server Actions with the session, request headers, domain module and mailer mocked.
vi.mock("server-only", () => ({}))

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: "user" | "admin" } } }))
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }))
const queued = vi.hoisted(() => [] as { scope: string; build: () => { to: string; subject: string } }[])
const refresh = vi.hoisted(() => vi.fn())
const lib = vi.hoisted(() => {
  class ContactRateLimitError extends Error {
    status = 429
  }
  class ContactOrderNotFoundError extends Error {
    status = 422
    fieldErrors = { orderNumber: ["We couldn't find this order on your account. Check the number, or leave it blank."] }
  }
  return {
    createContactMessage: vi.fn(),
    setContactMessageStatus: vi.fn(),
    ContactRateLimitError,
    ContactOrderNotFoundError,
  }
})

vi.mock("@/auth", () => ({ auth: async () => session.current }))
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }))
vi.mock("next/cache", () => ({ refresh }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
  },
}))
vi.mock("@/lib/contact", () => lib)
vi.mock("@/lib/mail", () => ({
  sendMailLater: (scope: string, build: () => { to: string; subject: string }) => void queued.push({ scope, build }),
  supportInbox: () => "support@northcart.test",
}))

const { sendContactMessage, setContactMessageStatus } = await import("@/app/actions/contact")

const USER_ID = "8d3c1f7a-1b2c-4d5e-8f90-a1b2c3d4e5f6"
const MESSAGE_ID = "0b0c4d4e-1111-4222-8333-444455556666"

const VALID = {
  name: "  Ada   Lovelace ",
  email: " Ada@Example.com ",
  orderNumber: " nc-10001 ",
  topic: "returns",
  message: "  Can I send the mug back?  ",
}

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const stored = (overrides = {}) => ({
  id: MESSAGE_ID,
  name: "Ada Lovelace",
  email: "ada@example.com",
  orderNumber: "NC-10001",
  topic: "returns",
  message: "Can I send the mug back?",
  status: "new",
  userId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  session.current = null
  requestHeaders.current = new Headers()
  queued.length = 0
  refresh.mockReset()
  lib.createContactMessage.mockReset().mockResolvedValue(stored())
  lib.setContactMessageStatus.mockReset().mockResolvedValue(stored({ status: "read" }))
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("sendContactMessage", () => {
  it("stores a guest's message with the normalised fields and the first forwarded IP", async () => {
    requestHeaders.current = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })

    const state = await sendContactMessage(undefined, form(VALID))

    expect(state).toEqual({ success: true, name: "Ada Lovelace", email: "ada@example.com" })
    expect(lib.createContactMessage).toHaveBeenCalledExactlyOnceWith(
      { name: "Ada Lovelace", email: "ada@example.com", orderNumber: "NC-10001", topic: "returns", message: "Can I send the mug back?" },
      { userId: null, ip: "203.0.113.7" },
    )
  })

  it("passes the signed-in user's id, falls back to x-real-ip and drops a blank order number", async () => {
    session.current = { user: { id: USER_ID, role: "user" } }
    requestHeaders.current = new Headers({ "x-real-ip": "198.51.100.2" })

    await sendContactMessage(undefined, form({ ...VALID, orderNumber: "   " }))

    expect(lib.createContactMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ orderNumber: undefined }),
      { userId: USER_ID, ip: "198.51.100.2" },
    )
  })

  it("queues the auto-reply to the sender and the notification to the support inbox", async () => {
    await sendContactMessage(undefined, form(VALID))

    expect(queued.map((q) => q.scope)).toEqual(["contact.auto-reply", "contact.notification"])
    const [reply, notification] = queued.map((q) => q.build())
    expect(reply).toMatchObject({ to: "ada@example.com", subject: "We've got your message" })
    expect(notification).toMatchObject({ to: "support@northcart.test", subject: "New message: Returns & refunds from Ada Lovelace" })
  })

  it("answers a filled-in honeypot with the usual success but stores and sends nothing", async () => {
    const state = await sendContactMessage(undefined, form({ ...VALID, website: "https://spam.example" }))

    expect(state).toEqual({ success: true, name: "Ada   Lovelace", email: "Ada@Example.com" })
    expect(lib.createContactMessage).not.toHaveBeenCalled()
    expect(queued).toEqual([])
  })

  it("ignores an empty honeypot", async () => {
    await sendContactMessage(undefined, form({ ...VALID, website: "  " }))
    expect(lib.createContactMessage).toHaveBeenCalledOnce()
  })

  it.each([
    ["name", "   ", "Please tell us your name."],
    ["name", "x".repeat(101), "Keep your name under 100 characters."],
    ["email", "ada@", "Please enter a valid email."],
    ["topic", "", "Choose what your message is about."],
    ["topic", "refund-now", "Choose what your message is about."],
    ["message", "too short", "Write at least 10 characters."],
    ["message", "x".repeat(2001), "Keep it under 2000 characters."],
    ["orderNumber", "N".repeat(31), "That doesn't look like an order number."],
  ])("refuses %s = %j with a field error and keeps what was typed", async (name, value, error) => {
    const state = await sendContactMessage(undefined, form({ ...VALID, [name]: value }))

    expect(state).toMatchObject({ errors: { [name]: [error] }, values: { ...VALID, [name]: value } })
    expect(lib.createContactMessage).not.toHaveBeenCalled()
    expect(queued).toEqual([])
  })

  it("accepts a message of exactly 10 and of exactly 2000 characters", async () => {
    await sendContactMessage(undefined, form({ ...VALID, message: "x".repeat(10) }))
    await sendContactMessage(undefined, form({ ...VALID, message: "x".repeat(2000) }))
    expect(lib.createContactMessage).toHaveBeenCalledTimes(2)
  })

  it("puts an order that isn't the user's under the order number field", async () => {
    session.current = { user: { id: USER_ID, role: "user" } }
    lib.createContactMessage.mockRejectedValue(new lib.ContactOrderNotFoundError())

    const state = await sendContactMessage(undefined, form(VALID))

    expect(state).toEqual({
      errors: { orderNumber: ["We couldn't find this order on your account. Check the number, or leave it blank."] },
      values: VALID,
    })
    expect(queued).toEqual([])
  })

  it("says to wait when the sender is rate limited", async () => {
    lib.createContactMessage.mockRejectedValue(Object.assign(new lib.ContactRateLimitError(), { message: "Please wait a minute." }))

    const state = await sendContactMessage(undefined, form(VALID))

    expect(state).toEqual({ message: "Please wait a minute.", values: VALID })
    expect(queued).toEqual([])
  })

  it("reports a generic failure when the database fails", async () => {
    lib.createContactMessage.mockRejectedValue(new Error("db down"))

    const state = await sendContactMessage(undefined, form(VALID))

    expect(state).toEqual({ message: "Something went wrong. Please try again.", values: VALID })
  })
})

describe("setContactMessageStatus", () => {
  it("sends signed-out callers to the login and back to the messages", async () => {
    await expect(setContactMessageStatus(MESSAGE_ID, "read")).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/login?callbackUrl=%2Fadmin%2Fmessages;307;",
    })
    expect(lib.setContactMessageStatus).not.toHaveBeenCalled()
  })

  it("refuses customers without touching the message", async () => {
    session.current = { user: { id: USER_ID, role: "user" } }

    const result = await setContactMessageStatus(MESSAGE_ID, "archived")

    expect(result).toEqual({ ok: false, message: "You don't have access to this action." })
    expect(lib.setContactMessageStatus).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  describe("as an admin", () => {
    beforeEach(() => {
      session.current = { user: { id: USER_ID, role: "admin" } }
    })

    it.each([
      ["read", "The message is marked as read."],
      ["new", "The message is marked as unread."],
      ["archived", "The message is archived."],
    ] as const)("sets the status to %s and refreshes", async (status, message) => {
      const result = await setContactMessageStatus(MESSAGE_ID, status)

      expect(result).toEqual({ ok: true, message })
      expect(lib.setContactMessageStatus).toHaveBeenCalledExactlyOnceWith(MESSAGE_ID, status)
      expect(refresh).toHaveBeenCalledOnce()
    })

    it("refuses a malformed id or an unknown status without a write", async () => {
      expect(await setContactMessageStatus("nope", "read")).toEqual({ ok: false, message: "This message no longer exists." })
      expect(await setContactMessageStatus(MESSAGE_ID, "deleted" as never)).toEqual({ ok: false, message: "Choose a valid status." })
      expect(lib.setContactMessageStatus).not.toHaveBeenCalled()
    })

    it("passes on a not-found message and hides unexpected errors", async () => {
      const { NotFoundError } = await import("@/lib/errors")
      lib.setContactMessageStatus.mockRejectedValueOnce(new NotFoundError("This message no longer exists."))
      expect(await setContactMessageStatus(MESSAGE_ID, "read")).toEqual({ ok: false, message: "This message no longer exists." })

      lib.setContactMessageStatus.mockRejectedValueOnce(new Error("db down"))
      expect(await setContactMessageStatus(MESSAGE_ID, "read")).toEqual({ ok: false, message: "Something went wrong. Please try again." })
      expect(refresh).not.toHaveBeenCalled()
    })
  })
})
