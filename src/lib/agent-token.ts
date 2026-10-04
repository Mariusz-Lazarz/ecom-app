import "server-only"

import {
  calculateJwkThumbprint,
  createLocalJWKSet,
  errors as joseErrors,
  exportJWK,
  importPKCS8,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWK,
} from "jose"

import { ServiceUnavailableError, UnauthorizedError } from "@/lib/errors"
import type { Role } from "@/lib/roles"

/**
 * Tokens for the support agent (see the Support chat section of CLAUDE.md). The chat routes sign
 * one for the signed-in user with every request to HarnessLab, which runs the agent; the agent
 * calls our MCP endpoint (`/api/mcp`) with the same token. The token says who the agent acts for
 * (`sub`, the user id) and what it may do for them (`scope`): never more than the user's role
 * allows, and only what the support agent is built for. ES256, signed with
 * `AGENT_TOKEN_PRIVATE_KEY`; HarnessLab checks it with the public key from `/api/agent/jwks`.
 */

export const AGENT_SCOPES = ["orders:read"] as const
export type AgentScope = (typeof AGENT_SCOPES)[number]

/** What each role may let an agent do on its behalf. */
const ROLE_SCOPES: Record<Role, readonly AgentScope[]> = {
  user: ["orders:read"],
  admin: ["orders:read"],
}

/** What the support agent is built to do. */
export const SUPPORT_AGENT_SCOPES: readonly AgentScope[] = ["orders:read"]

export const AGENT_TOKEN_TTL_SECONDS = 15 * 60

export type AgentUser = { id: string; role: Role }
export type AgentClaims = { userId: string; scopes: AgentScope[] }

/** The support agent's scopes for a user: what it is built for, cut down to what their role allows. */
export function agentScopes(role: Role): AgentScope[] {
  return SUPPORT_AGENT_SCOPES.filter((scope) => ROLE_SCOPES[role].includes(scope))
}

type SigningKey = { privateKey: CryptoKey; jwk: JWK & { kid: string } }

let signingKey: Promise<SigningKey> | null = null

function config() {
  const pem = process.env.AGENT_TOKEN_PRIVATE_KEY?.replace(/\\n/g, "\n").trim()
  const issuer = process.env.AGENT_TOKEN_ISSUER || process.env.APP_URL
  const audience = process.env.AGENT_TOKEN_AUDIENCE
  if (!pem || !issuer || !audience) {
    throw new ServiceUnavailableError("The support chat is not configured")
  }
  return { pem, issuer, audience }
}

async function loadSigningKey(pem: string): Promise<SigningKey> {
  // Extractable, so the public half can be published in the JWKS.
  const privateKey = await importPKCS8(pem, "ES256", { extractable: true })
  const { kty, crv, x, y } = await exportJWK(privateKey)
  const publicJwk: JWK = { kty, crv, x, y }
  const kid = await calculateJwkThumbprint(publicJwk)
  return { privateKey, jwk: { ...publicJwk, kid, alg: "ES256", use: "sig" } }
}

function getSigningKey(): Promise<SigningKey> {
  const { pem } = config()
  signingKey ??= loadSigningKey(pem).catch((err) => {
    signingKey = null
    throw new ServiceUnavailableError("The support chat's signing key is invalid", { cause: err })
  })
  return signingKey
}

/** A token for the support agent to act for `user`, valid for AGENT_TOKEN_TTL_SECONDS. */
export async function signAgentToken(user: AgentUser): Promise<string> {
  const { issuer, audience } = config()
  const { privateKey, jwk } = await getSigningKey()
  return new SignJWT({ scope: agentScopes(user.role).join(" ") })
    .setProtectedHeader({ alg: "ES256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${AGENT_TOKEN_TTL_SECONDS}s`)
    .setJti(crypto.randomUUID())
    .sign(privateKey)
}

/** Checks a token from the agent and returns who it acts for; UnauthorizedError when it isn't valid. */
export async function verifyAgentToken(token: string): Promise<AgentClaims> {
  const { issuer, audience } = config()
  const { jwk } = await getSigningKey()
  try {
    const { payload } = await jwtVerify(token, createLocalJWKSet({ keys: [jwk] }), {
      issuer,
      audience,
      algorithms: ["ES256"],
      requiredClaims: ["sub", "exp", "iat"],
      maxTokenAge: AGENT_TOKEN_TTL_SECONDS,
    })
    const scopes = (typeof payload.scope === "string" ? payload.scope.split(" ") : []).filter(
      (scope): scope is AgentScope => (AGENT_SCOPES as readonly string[]).includes(scope),
    )
    return { userId: payload.sub!, scopes }
  } catch (err) {
    if (err instanceof joseErrors.JOSEError) {
      throw new UnauthorizedError(err instanceof joseErrors.JWTExpired ? "Agent token expired" : "Invalid agent token")
    }
    throw err
  }
}

/** The public key, as the JWKS HarnessLab verifies our tokens with. */
export async function agentJwks(): Promise<{ keys: JWK[] }> {
  const { jwk } = await getSigningKey()
  return { keys: [jwk] }
}
