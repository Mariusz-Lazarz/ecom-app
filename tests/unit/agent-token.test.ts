// @vitest-environment node
import { generateKeyPairSync } from "node:crypto"

import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify, SignJWT, importPKCS8 } from "jose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const pem = (key = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey) =>
  key.export({ type: "pkcs8", format: "pem" }).toString()

const PEM = pem()

async function load(env: Record<string, string | undefined> = {}) {
  vi.resetModules()
  vi.stubEnv("AGENT_TOKEN_PRIVATE_KEY", PEM)
  vi.stubEnv("AGENT_TOKEN_ISSUER", "http://shop.test")
  vi.stubEnv("AGENT_TOKEN_AUDIENCE", "northcart-agent")
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string)
  return import("@/lib/agent-token")
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("agentScopes", () => {
  it("gives customers and admins the support agent's scopes their role allows", async () => {
    const { agentScopes } = await load()
    expect(agentScopes("user")).toEqual(["orders:read"])
    expect(agentScopes("admin")).toEqual(["orders:read"])
  })
})

describe("signAgentToken", () => {
  it("signs a 15-minute ES256 token for the user with their scopes", async () => {
    const { signAgentToken, agentJwks, AGENT_TOKEN_TTL_SECONDS } = await load()
    const token = await signAgentToken({ id: "user-1", role: "user" })

    const { keys } = await agentJwks()
    const { payload, protectedHeader } = await jwtVerify(token, createLocalJWKSet({ keys }), {
      issuer: "http://shop.test",
      audience: "northcart-agent",
    })
    expect(protectedHeader).toEqual({ alg: "ES256", kid: keys[0].kid })
    expect(payload.sub).toBe("user-1")
    expect(payload.scope).toBe("orders:read")
    expect(payload.exp! - payload.iat!).toBe(AGENT_TOKEN_TTL_SECONDS)
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("takes the issuer from APP_URL when AGENT_TOKEN_ISSUER is not set and reads \\n in the key", async () => {
    const { signAgentToken } = await load({
      AGENT_TOKEN_ISSUER: "",
      APP_URL: "http://localhost:3000",
      AGENT_TOKEN_PRIVATE_KEY: PEM.replace(/\n/g, "\\n"),
    })
    expect(decodeJwt(await signAgentToken({ id: "u", role: "user" })).iss).toBe("http://localhost:3000")
  })

  it("answers 503 when the chat is not configured or the key is invalid", async () => {
    for (const env of [{ AGENT_TOKEN_PRIVATE_KEY: "" }, { AGENT_TOKEN_AUDIENCE: "" }, { AGENT_TOKEN_PRIVATE_KEY: "not a key" }]) {
      const { signAgentToken } = await load(env)
      await expect(signAgentToken({ id: "u", role: "user" })).rejects.toMatchObject({ status: 503 })
    }
  })
})

describe("agentJwks", () => {
  it("publishes only the public half of the key, with a stable kid", async () => {
    const { agentJwks } = await load()
    const { keys } = await agentJwks()
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({ kty: "EC", crv: "P-256", alg: "ES256", use: "sig" })
    expect(keys[0]).not.toHaveProperty("d")
    expect((await (await load()).agentJwks()).keys[0].kid).toBe(keys[0].kid)
  })
})

describe("verifyAgentToken", () => {
  it("returns the user and the known scopes of a token it signed", async () => {
    const { signAgentToken, verifyAgentToken } = await load()
    const token = await signAgentToken({ id: "user-7", role: "admin" })
    expect(await verifyAgentToken(token)).toEqual({ userId: "user-7", scopes: ["orders:read"] })
  })

  async function forged(claims: Record<string, unknown>, { key = PEM, expiresIn = "15m" } = {}) {
    const { agentJwks } = await load()
    const { keys } = await agentJwks()
    const jwt = new SignJWT({ scope: "orders:read", ...claims })
      .setProtectedHeader({ alg: "ES256", kid: keys[0].kid })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
    if (!("iss" in claims)) jwt.setIssuer("http://shop.test")
    if (!("aud" in claims)) jwt.setAudience("northcart-agent")
    if (!("sub" in claims)) jwt.setSubject("user-1")
    return jwt.sign(await importPKCS8(key, "ES256"))
  }

  it("rejects tokens signed with another key, for another audience or issuer, or expired", async () => {
    const { verifyAgentToken } = await load()
    const cases = [
      await forged({}, { key: pem() }),
      await forged({ aud: "someone-else" }),
      await forged({ iss: "http://evil.test" }),
      "not.a.token",
    ]
    for (const token of cases) {
      await expect(verifyAgentToken(token)).rejects.toMatchObject({ status: 401, message: "Invalid agent token" })
    }
  })

  it("says when a token expired", async () => {
    const { signAgentToken, verifyAgentToken } = await load()
    vi.useFakeTimers({ now: new Date("2026-10-04T12:00:00Z") })
    const token = await signAgentToken({ id: "u", role: "user" })
    vi.setSystemTime(new Date("2026-10-04T12:16:00Z"))
    await expect(verifyAgentToken(token)).rejects.toMatchObject({ status: 401, message: "Agent token expired" })
  })

  it("rejects a token without sub and drops scopes it doesn't know", async () => {
    const { verifyAgentToken } = await load()
    await expect(verifyAgentToken(await forged({ sub: undefined }))).rejects.toMatchObject({ status: 401 })
    const claims = await verifyAgentToken(await forged({ scope: "orders:read orders:write admin" }))
    expect(claims.scopes).toEqual(["orders:read"])
    expect(decodeProtectedHeader(await forged({})).alg).toBe("ES256")
  })
})
