"use server"

import { signOut } from "@/auth"

export async function logout() {
  // Auth.js clears the session cookie and throws Next's redirect to the home page.
  await signOut({ redirectTo: "/" })
}
