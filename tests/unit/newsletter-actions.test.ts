import { beforeEach, describe, expect, it, vi } from "vitest"

// The newsletter Server Actions with the domain module and mailer mocked: what they pass on, what
// they answer, and which emails they queue.
vi.mock("server-only", () => ({}))

const lib = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }))
const queued = vi.hoisted(() => [] as { scope: string; build: () => unknown }[])

vi.mock("@/lib/newsletter", () => ({
  subscribe: (...args: unknown[]) => lib.subscribe(...args),
  unsubscribe: (...args: unknown[]) => lib.unsubscribe(...args),
  newsletterConfirmationMessage: (email: string, token: string) => ({ to: email, subject: "confirm", token }),
}))
vi.mock("@/lib/mail", () => ({
  sendMailLater: (scope: string, build: () => unknown) => void queued.push({ scope, build }),
}))

const { subscribeToNewsletter, unsubscribeFromNewsletter } = await import("@/app/actions/newsletter")

const TOKEN = "Xf3k9_-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

beforeEach(() => {
  lib.subscribe.mockReset()
  lib.unsubscribe.mockReset()
  queued.length = 0
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("subscribeToNewsletter", () => {
  it.each([
    ["", "an empty"],
    ["not-an-email", "a malformed"],
    ["a@b", "a domain-less"],
  ])("rejects %j (%s email) without touching the database", async (email) => {
    const state = await subscribeToNewsletter(undefined, form({ email }))

    expect(state).toEqual({ errors: { email: ["Please enter a valid email."] }, values: { email } })
    expect(lib.subscribe).not.toHaveBeenCalled()
    expect(queued).toEqual([])
  })

  it("subscribes the trimmed, lower-cased email from the home page and queues the confirmation", async () => {
    lib.subscribe.mockResolvedValue({ status: "subscribed", email: "ada@example.com", token: TOKEN })

    const state = await subscribeToNewsletter(undefined, form({ email: "  Ada@Example.COM " }))

    expect(state).toEqual({ success: true, email: "ada@example.com" })
    expect(lib.subscribe).toHaveBeenCalledExactlyOnceWith("ada@example.com", "home")
    expect(queued).toHaveLength(1)
    expect(queued[0].scope).toBe("newsletter")
    expect(queued[0].build()).toEqual({ to: "ada@example.com", subject: "confirm", token: TOKEN })
  })

  it("answers the same when the sign-up was throttled, but sends nothing", async () => {
    lib.subscribe.mockResolvedValue({ status: "throttled" })

    const state = await subscribeToNewsletter(undefined, form({ email: "ada@example.com" }))

    expect(state).toEqual({ success: true, email: "ada@example.com" })
    expect(queued).toEqual([])
  })

  it("reports a generic failure and keeps the typed email when the database fails", async () => {
    lib.subscribe.mockRejectedValue(new Error("db down"))

    const state = await subscribeToNewsletter(undefined, form({ email: "ada@example.com" }))

    expect(state).toEqual({ message: "Something went wrong. Please try again.", values: { email: "ada@example.com" } })
    expect(queued).toEqual([])
  })
})

describe("unsubscribeFromNewsletter", () => {
  it.each(["", "short", `${TOKEN}x`, "Xf3k9_-abcdefghijklmnopqrstuvwxyzABCDEFGH!J"])(
    "refuses the malformed token %j without a lookup",
    async (token) => {
      const state = await unsubscribeFromNewsletter(undefined, form({ token }))

      expect(state).toMatchObject({ status: "invalid", message: expect.stringContaining("isn't valid any more") })
      expect(lib.unsubscribe).not.toHaveBeenCalled()
    },
  )

  it("says the link is invalid for an unknown token", async () => {
    lib.unsubscribe.mockResolvedValue({ status: "invalid" })

    const state = await unsubscribeFromNewsletter(undefined, form({ token: TOKEN }))

    expect(lib.unsubscribe).toHaveBeenCalledExactlyOnceWith(TOKEN)
    expect(state).toMatchObject({ status: "invalid" })
  })

  it.each(["unsubscribed", "already-unsubscribed"])("confirms with the address when the result is %s", async (status) => {
    lib.unsubscribe.mockResolvedValue({ status, email: "ada@example.com" })

    const state = await unsubscribeFromNewsletter(undefined, form({ token: TOKEN }))

    expect(state).toEqual({ status: "unsubscribed", email: "ada@example.com" })
  })

  it("reports a generic failure when the database fails", async () => {
    lib.unsubscribe.mockRejectedValue(new Error("db down"))

    const state = await unsubscribeFromNewsletter(undefined, form({ token: TOKEN }))

    expect(state).toEqual({ status: "error", message: "Something went wrong. Please try again." })
  })
})
