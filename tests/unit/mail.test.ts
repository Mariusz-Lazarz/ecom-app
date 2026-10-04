import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const transport = vi.hoisted(() => ({ sendMail: vi.fn() }))
const createTransport = vi.hoisted(() => vi.fn(() => transport))
vi.mock("nodemailer", () => ({ default: { createTransport } }))

const afterCallbacks = vi.hoisted(() => ({ queue: [] as (() => Promise<void>)[], outsideRequest: false }))
vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => {
    if (afterCallbacks.outsideRequest) throw new Error("`after` was called outside a request scope")
    afterCallbacks.queue.push(callback)
  },
}))

const log = vi.hoisted(() => {
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => log }
  return log
})
vi.mock("@/lib/logger", () => ({ logger: log }))

const { mailConfig, sendMail, sendMailLater } = await import("@/lib/mail")

const MESSAGE = { to: "ada@example.com", subject: "Hello", html: "<p>Hi</p>", text: "Hi" }
const ENV_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "MAIL_FROM"] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

function configure(env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  Object.assign(process.env, { SMTP_HOST: "localhost", SMTP_PORT: "1025", ...env })
}

async function runAfterCallbacks() {
  for (const callback of afterCallbacks.queue.splice(0)) await callback()
}

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  ;(globalThis as { mailTransport?: unknown }).mailTransport = undefined
  createTransport.mockClear()
  transport.sendMail.mockReset().mockResolvedValue({ messageId: "<id@mailpit>" })
  for (const fn of [log.debug, log.info, log.warn, log.error]) fn.mockReset()
  afterCallbacks.queue = []
  afterCallbacks.outsideRequest = false
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

describe("mailConfig", () => {
  it("is null without SMTP_HOST (blank counts as unset)", () => {
    expect(mailConfig()).toBeNull()
    process.env.SMTP_HOST = "  "
    expect(mailConfig()).toBeNull()
  })

  it("reads host, port and sender, without auth when there's no user", () => {
    configure({ MAIL_FROM: "Shop <shop@example.com>" })
    expect(mailConfig()).toEqual({ host: "localhost", port: 1025, secure: false, auth: undefined, from: "Shop <shop@example.com>" })
  })

  it("defaults the port by SMTP_SECURE and the sender to Northcart's no-reply", () => {
    configure({ SMTP_PORT: "" })
    expect(mailConfig()).toMatchObject({ port: 587, secure: false, from: "Northcart <no-reply@northcart.test>" })
    configure({ SMTP_PORT: "", SMTP_SECURE: "true" })
    expect(mailConfig()).toMatchObject({ port: 465, secure: true })
  })

  it("uses SMTP_USER and SMTP_PASS as credentials", () => {
    configure({ SMTP_USER: "apikey", SMTP_PASS: "s3cret" })
    expect(mailConfig()?.auth).toEqual({ user: "apikey", pass: "s3cret" })
  })
})

describe("sendMail", () => {
  it("skips sending without SMTP config and logs the recipient and subject at info", async () => {
    await expect(sendMail(MESSAGE)).resolves.toBe(false)

    expect(createTransport).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith("SMTP isn't configured, email not sent", { to: "ada@example.com", subject: "Hello" })
  })

  it("sends through the SMTP transport from MAIL_FROM", async () => {
    configure({ MAIL_FROM: "Northcart <no-reply@northcart.test>" })

    await expect(sendMail(MESSAGE)).resolves.toBe(true)

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "localhost", port: 1025, secure: false }))
    expect(transport.sendMail).toHaveBeenCalledWith({ from: "Northcart <no-reply@northcart.test>", ...MESSAGE })
    expect(log.info).toHaveBeenCalledWith("Email sent", expect.objectContaining({ to: "ada@example.com", messageId: "<id@mailpit>" }))
  })

  it("logs a failed send and resolves to false instead of throwing", async () => {
    configure()
    const err = new Error("connect ECONNREFUSED 127.0.0.1:1025")
    transport.sendMail.mockRejectedValue(err)

    await expect(sendMail(MESSAGE)).resolves.toBe(false)

    expect(log.error).toHaveBeenCalledWith("Email failed to send", { to: "ada@example.com", subject: "Hello", err })
  })

  it("reuses the transport while the config stays the same", async () => {
    configure()
    await sendMail(MESSAGE)
    await sendMail(MESSAGE)
    expect(createTransport).toHaveBeenCalledTimes(1)

    configure({ SMTP_PORT: "2525" })
    await sendMail(MESSAGE)
    expect(createTransport).toHaveBeenCalledTimes(2)
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 2525 }))
  })
})

describe("sendMailLater", () => {
  it("builds and sends the email only after the response", async () => {
    configure()
    const build = vi.fn(() => MESSAGE)

    sendMailLater("test", build)
    expect(build).not.toHaveBeenCalled()
    expect(transport.sendMail).not.toHaveBeenCalled()

    await runAfterCallbacks()
    expect(build).toHaveBeenCalledTimes(1)
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "ada@example.com", subject: "Hello" }))
  })

  it("sends nothing when the builder returns null", async () => {
    configure()
    sendMailLater("test", async () => null)
    await runAfterCallbacks()
    expect(transport.sendMail).not.toHaveBeenCalled()
  })

  it("logs a builder that throws under mail.<scope> without rethrowing", async () => {
    configure()
    sendMailLater("order-status", async () => {
      throw new Error("db down")
    })

    await expect(runAfterCallbacks()).resolves.toBeUndefined()
    expect(transport.sendMail).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledWith("db down", expect.objectContaining({ scope: "mail.order-status" }))
  })

  it("doesn't throw when the send fails", async () => {
    configure()
    transport.sendMail.mockRejectedValue(new Error("SMTP down"))
    sendMailLater("test", () => MESSAGE)

    await expect(runAfterCallbacks()).resolves.toBeUndefined()
    expect(log.error).toHaveBeenCalledWith("Email failed to send", expect.objectContaining({ subject: "Hello" }))
  })

  it("sends straight away outside a request", async () => {
    configure()
    afterCallbacks.outsideRequest = true

    sendMailLater("test", () => MESSAGE)

    await vi.waitFor(() => expect(transport.sendMail).toHaveBeenCalledTimes(1))
    expect(afterCallbacks.queue).toHaveLength(0)
  })
})
