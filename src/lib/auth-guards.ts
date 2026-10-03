import "server-only"

import { notFound, redirect } from "next/navigation"

import type { Session } from "next-auth"

import { auth } from "@/auth"
import { loginHref } from "@/lib/safe-redirect"

/** A session whose user is known to have an id. */
export type UserSession = Session & { user: Session["user"] & { id: string } }

/**
 * Returns the session, or redirects signed-out visitors (and sessions without a user id) to
 * /login. With `returnTo` (a same-origin path, usually the current page) the login sends them
 * back there afterwards.
 */
export async function requireUser(returnTo?: string): Promise<UserSession> {
  const session = await auth()
  if (!session?.user?.id) redirect(loginHref(returnTo))
  return session as UserSession
}

/**
 * Returns an admin's session. Signed-out visitors go to /login (and back to `returnTo` afterwards,
 * as with `requireUser`); other users get a 404, so admin pages don't reveal that they exist.
 */
export async function requireAdmin(returnTo?: string) {
  const session = await requireUser(returnTo)
  if (session.user.role !== "admin") notFound()
  return session
}
