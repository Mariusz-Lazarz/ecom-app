// @vitest-environment node
import { generateKeyPairSync } from "node:crypto"

import { decodeJwt } from "jose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: "user" | "admin" } } }))
vi.mock("@/auth", () => ({ auth: async () => session.current }))

vi.stubEnv(
  "AGENT_TOKEN_PRIVATE_KEY",
  generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
)
vi.stubEnv("AGENT_TOKEN_ISSUER", "http://shop.test")
vi.stubEnv("AGENT_TOKEN_AUDIENCE", "northcart-agent")
vi.stubEnv("HARNESSLAB_APP_API_URL", "http://harnesslab.test/")
vi.stubEnv("HARNESSLAB_APP_API_KEY", "hlk_test")

const sessions = await import("@/app/api/chat/sessions/route")
const messages = await import("@/app/api/chat/sessions/[id]/messages/route")

const fetchMock = vi.fn<typeof fetch>()
const realFetch = globalThis.fetch

const chatSession = { id: "a1b2c3d4", title: null, createdAt: "2026-10-04T12:00:00Z", lastActivityAt: "2026-10-04T12:00:00Z", status: "idle" }
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never

beforeEach(() => {
  session.current = { user: { id: "user-1", role: "user" } }
  globalThis.fetch = fetchMock
  fetchMock.mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  globalThis.fetch = realFetch
})

/** What the route sent to HarnessLab. */
function sent(call = 0) {
  const [url, init] = fetchMock.mock.calls[call]
  const headers = init!.headers as Record<string, string>
  return { url: String(url), method: init!.method, headers, body: init!.body ? JSON.parse(String(init!.body)) : undefined }
}

describe("/api/chat/sessions", () => {
  it("answers 401 to visitors without calling HarnessLab", async () => {
    session.current = null
    const res = await sessions.GET(new Request("http://localhost/api/chat/sessions"), {} as never)
    expect(res.status).toBe(401)
    expect((await res.json()).error.message).toBe("Sign in to chat with us")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("lists the user's conversations with the API key and a token for the user", async () => {
    fetchMock.mockResolvedValue(Response.json({ sessions: [chatSession] }))
    const res = await sessions.GET(new Request("http://localhost/api/chat/sessions"), {} as never)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sessions: [chatSession] })
    const request = sent()
    expect(request.url).toBe("http://harnesslab.test/v1/sessions")
    expect(request.method).toBe("GET")
    expect(request.headers.authorization).toBe("Bearer hlk_test")
    const claims = decodeJwt(request.headers["x-user-token"])
    expect(claims).toMatchObject({ sub: "user-1", scope: "orders:read", aud: "northcart-agent", iss: "http://shop.test" })
  })

  it("creates a conversation (201)", async () => {
    fetchMock.mockResolvedValue(Response.json({ session: chatSession }, { status: 201 }))
    const res = await sessions.POST(new Request("http://localhost/api/chat/sessions", { method: "POST" }), {} as never)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ session: chatSession })
    expect(sent().method).toBe("POST")
  })

  it("answers 503 when HarnessLab is unreachable or refuses the shop's key", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
    expect((await sessions.GET(new Request("http://localhost/api/chat/sessions"), {} as never)).status).toBe(503)
    fetchMock.mockResolvedValueOnce(Response.json({ error: "invalid app API key" }, { status: 401 }))
    const res = await sessions.GET(new Request("http://localhost/api/chat/sessions"), {} as never)
    expect(res.status).toBe(503)
    expect((await res.json()).error.message).toBe("The support chat is unavailable right now")
  })

  it("answers 503 when the chat is not configured", async () => {
    vi.stubEnv("HARNESSLAB_APP_API_KEY", "")
    try {
      expect((await sessions.GET(new Request("http://localhost/api/chat/sessions"), {} as never)).status).toBe(503)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.stubEnv("HARNESSLAB_APP_API_KEY", "hlk_test")
    }
  })
})

describe("/api/chat/sessions/[id]/messages", () => {
  const post = (id: string, body: unknown) =>
    messages.POST(
      new Request(`http://localhost/api/chat/sessions/${id}/messages`, { method: "POST", body: JSON.stringify(body) }),
      ctx(id),
    )

  it("sends the trimmed message (202)", async () => {
    const reply = { message: { id: "5", role: "user", content: "Where is NC-10001?", createdAt: "x" }, session: { ...chatSession, status: "running" } }
    fetchMock.mockResolvedValue(Response.json(reply, { status: 202 }))

    const res = await post("a1b2c3d4", { message: "  Where is NC-10001?  " })

    expect(res.status).toBe(202)
    expect(await res.json()).toEqual(reply)
    expect(sent()).toMatchObject({
      url: "http://harnesslab.test/v1/sessions/a1b2c3d4/messages",
      method: "POST",
      body: { message: "Where is NC-10001?" },
    })
  })

  it("rejects an empty or too long message and a malformed id without calling HarnessLab", async () => {
    expect((await post("a1b2c3d4", { message: "   " })).status).toBe(422)
    expect((await post("a1b2c3d4", { message: "x".repeat(2001) })).status).toBe(422)
    expect((await post("../admin", { message: "hi" })).status).toBe(422)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("passes 404 for someone else's conversation and 409 while the assistant answers", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "session not found" }, { status: 404 }))
    expect((await post("a1b2c3d4", { message: "hi" })).status).toBe(404)
    fetchMock.mockResolvedValueOnce(Response.json({ error: "session has a turn in progress" }, { status: 409 }))
    const busy = await post("a1b2c3d4", { message: "hi" })
    expect(busy.status).toBe(409)
    expect((await busy.json()).error.message).toBe("The assistant is still answering")
  })

  it("polls messages after an id and rejects after with before", async () => {
    fetchMock.mockResolvedValue(Response.json({ messages: [], hasMore: false, session: chatSession }))
    const get = (query: string) =>
      messages.GET(new Request(`http://localhost/api/chat/sessions/a1b2c3d4/messages${query}`), ctx("a1b2c3d4"))

    expect((await get("?after=12")).status).toBe(200)
    expect(sent().url).toBe("http://harnesslab.test/v1/sessions/a1b2c3d4/messages?after=12")
    expect((await get("?after=12&before=3")).status).toBe(400)
    expect((await get("?after=abc")).status).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
