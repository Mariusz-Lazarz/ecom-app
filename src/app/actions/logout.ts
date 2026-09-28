"use server"

import { signOut } from "@/auth"
import { flash } from "@/lib/flash"

export async function logout() {
  await flash({ type: "success", title: "You've been signed out." })
  // Auth.js clears the session cookie and throws Next's redirect to the home page.
  await signOut({ redirectTo: "/" })
}
