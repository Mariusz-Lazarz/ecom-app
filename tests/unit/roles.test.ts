import type { Session, User } from "next-auth"
import type { JWT } from "next-auth/jwt"
import { describe, expect, it } from "vitest"

import { jwtWithRole, sessionWithRole } from "@/lib/roles"

const user = (role?: unknown) => ({ id: "u1", email: "jan@example.com", name: "Jan Kowalski", role }) as User
const session = () =>
  ({
    user: { name: "Jan Kowalski", email: "jan@example.com" },
    expires: "2099-01-01T00:00:00.000Z",
  }) as Session

describe("jwtWithRole", () => {
  it("copies an admin role from the user on sign-in", () => {
    expect(jwtWithRole({ token: { sub: "u1" }, user: user("admin") })).toEqual({ sub: "u1", role: "admin" })
  })

  it("copies a user role from the user on sign-in", () => {
    expect(jwtWithRole({ token: { sub: "u1" }, user: user("user") })).toEqual({ sub: "u1", role: "user" })
  })

  it("falls back to 'user' for a missing or unknown role", () => {
    expect(jwtWithRole({ token: {}, user: user() }).role).toBe("user")
    expect(jwtWithRole({ token: {}, user: user("superuser") }).role).toBe("user")
  })

  it("keeps the token's role on later calls without a user", () => {
    const token: JWT = { sub: "u1", role: "admin" }
    expect(jwtWithRole({ token })).toEqual({ sub: "u1", role: "admin" })
  })
})

describe("sessionWithRole", () => {
  it("exposes the token's role on session.user", () => {
    expect(sessionWithRole({ session: session(), token: { role: "admin" } }).user).toEqual({
      name: "Jan Kowalski",
      email: "jan@example.com",
      role: "admin",
    })
  })

  it("defaults to 'user' when the token has no role (sessions issued before roles existed)", () => {
    expect(sessionWithRole({ session: session(), token: {} }).user.role).toBe("user")
  })

  it("leaves a session without a user untouched", () => {
    const empty = { expires: "2099-01-01T00:00:00.000Z" } as Session
    expect(sessionWithRole({ session: empty, token: { role: "admin" } })).toEqual({
      expires: "2099-01-01T00:00:00.000Z",
    })
  })
})
