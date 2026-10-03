import "server-only"

import { notFound, redirect } from "next/navigation"

import { auth } from "@/auth"

/** Returns the session, or redirects signed-out visitors to /login. */
export async function requireUser() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  return session
}

/** Returns an admin's session; signed-out visitors go to /login, other users get a 404. */
export async function requireAdmin() {
  const session = await requireUser()
  if (session.user.role !== "admin") notFound()
  return session
}
