// @vitest-environment node
import { generateKeyPairSync } from "node:crypto"

import { importPKCS8, SignJWT } from "jose"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AgentOrderDetail, AgentOrderList } from "@/lib/agent-tools"

vi.mock("server-only", () => ({}))

const listMyOrders = vi.fn<(userId: string, page?: number) => Promise<AgentOrderList>>()
const getMyOrder = vi.fn<(userId: string, number: string) => Promise<AgentOrderDetail | null>>()
vi.mock("@/lib/agent-tools", () => ({ listMyOrders, getMyOrder }))

vi.stubEnv(
  "AGENT_TOKEN_PRIVATE_KEY",
  generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
)
vi.stubEnv("AGENT_TOKEN_ISSUER", "http://shop.test")
vi.stubEnv("AGENT_TOKEN_AUDIENCE", "northcart-agent")

const { POST, GET, DELETE } = await import("@/app/api/mcp/route")
const { GET: jwks } = await import("@/app/api/agent/jwks/route")
const { agentJwks, signAgentToken } = await import("@/lib/agent-token")

let nextId = 1
async function rpc(token: string | null, method: string, params: unknown = {}) {
  const res = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    }),
    {} as never,
  )
  return { status: res.status, body: await res.json() }
}

const toolText = (body: { result: { content: { text: string }[] } }) => body.result.content[0].text

beforeEach(() => {
  listMyOrders.mockReset()
  getMyOrder.mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("POST /api/mcp", () => {
  it("answers 401 without a token or with a token it didn't sign", async () => {
    expect((await rpc(null, "tools/list")).status).toBe(401)
    const res = await rpc("eyJhbGciOiJFUzI1NiJ9.e30.c2ln", "tools/list")
    expect(res.status).toBe(401)
    expect(res.body.error.message).toBe("Invalid agent token")
    expect(listMyOrders).not.toHaveBeenCalled()
  })

  it("initializes and lists the order tools for a customer's token", async () => {
    const token = await signAgentToken({ id: "user-1", role: "user" })
    const init = await rpc(token, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    })
    expect(init.status).toBe(200)
    expect(init.body.result.serverInfo.name).toBe("northcart")

    const list = await rpc(token, "tools/list")
    expect(list.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["list_my_orders", "get_my_order"])
  })

  it("runs the tools for the token's user, whatever the arguments say", async () => {
    const token = await signAgentToken({ id: "user-1", role: "user" })
    listMyOrders.mockResolvedValue({ orders: [], page: 1, pageCount: 0, totalOrders: 0 })
    getMyOrder.mockResolvedValue({ number: "NC-10001" } as AgentOrderDetail)

    const listed = await rpc(token, "tools/call", { name: "list_my_orders", arguments: { page: 1, userId: "user-2" } })
    expect(JSON.parse(toolText(listed.body))).toEqual({ orders: [], page: 1, pageCount: 0, totalOrders: 0 })
    expect(listMyOrders).toHaveBeenCalledWith("user-1", 1)

    const order = await rpc(token, "tools/call", { name: "get_my_order", arguments: { number: "NC-10001" } })
    expect(JSON.parse(toolText(order.body))).toEqual({ number: "NC-10001" })
    expect(getMyOrder).toHaveBeenCalledWith("user-1", "NC-10001")
  })

  it("reports an order that isn't the user's as a tool error", async () => {
    getMyOrder.mockResolvedValue(null)
    const token = await signAgentToken({ id: "user-1", role: "user" })
    const res = await rpc(token, "tools/call", { name: "get_my_order", arguments: { number: "NC-10099" } })
    expect(res.body.result.isError).toBe(true)
    expect(toolText(res.body)).toBe("No order NC-10099 was found on this account.")
  })

  it("rejects invalid arguments before running a tool", async () => {
    const token = await signAgentToken({ id: "user-1", role: "user" })
    const res = await rpc(token, "tools/call", { name: "list_my_orders", arguments: { page: 0 } })
    expect(res.body.result?.isError ?? res.body.error).toBeTruthy()
    expect(listMyOrders).not.toHaveBeenCalled()
  })

  it("lists no tools and refuses calls for a token without scopes", async () => {
    const { keys } = await agentJwks()
    const token = await new SignJWT({ scope: "" })
      .setProtectedHeader({ alg: "ES256", kid: keys[0].kid })
      .setIssuer("http://shop.test")
      .setAudience("northcart-agent")
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(await importPKCS8(process.env.AGENT_TOKEN_PRIVATE_KEY!, "ES256"))

    const list = await rpc(token, "tools/list")
    expect(list.body.result?.tools ?? []).toEqual([])
    const call = await rpc(token, "tools/call", { name: "list_my_orders", arguments: {} })
    expect(call.body.result?.isError ?? call.body.error).toBeTruthy()
    expect(listMyOrders).not.toHaveBeenCalled()
  })
})

describe("GET and DELETE /api/mcp", () => {
  it("answer 405 with Allow: POST, since the server keeps no stream or session", async () => {
    for (const handler of [GET, DELETE]) {
      const res = handler()
      expect(res.status).toBe(405)
      expect(res.headers.get("allow")).toBe("POST")
    }
  })
})

describe("GET /api/agent/jwks", () => {
  it("serves the public key, cacheable for 5 minutes", async () => {
    const res = await jwks(new Request("http://localhost/api/agent/jwks"), {} as never)
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("public, max-age=300")
    const { keys } = await res.json()
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({ kty: "EC", crv: "P-256", alg: "ES256" })
    expect(keys[0].d).toBeUndefined()
  })
})
