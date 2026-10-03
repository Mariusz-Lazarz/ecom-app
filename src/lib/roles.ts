import type { Session, User } from "next-auth"
import type { JWT } from "next-auth/jwt"

export const ROLES = ["user", "admin"] as const
export type Role = (typeof ROLES)[number]

function toRole(value: unknown): Role {
  return value === "admin" ? "admin" : "user"
}

/** Auth.js `jwt` callback: copies the role from the user on sign-in; later calls keep the token's role. */
export function jwtWithRole({ token, user }: { token: JWT; user?: User | null }): JWT {
  if (user) token.role = toRole(user.role)
  return token
}

/** Auth.js `session` callback: exposes the token's role as `session.user.role`. */
export function sessionWithRole({ session, token }: { session: Session; token: JWT }): Session {
  if (session.user) session.user.role = toRole(token.role)
  return session
}
