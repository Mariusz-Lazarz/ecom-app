import "server-only"

import { cookies } from "next/headers"

import { FLASH_COOKIE, type Notification } from "@/lib/notifications"

/**
 * Queues a toast for the browser from a Server Action or Route Handler. It survives a `redirect()`
 * and is shown once by `<FlashToaster />`, which then deletes the cookie. Calling it again before
 * the browser picks it up replaces the queued notification.
 */
export async function flash(notification: Notification) {
  const cookieStore = await cookies()
  cookieStore.set(FLASH_COOKIE, JSON.stringify(notification), {
    path: "/",
    // Only a fallback: the client reads and deletes the cookie as soon as the response lands.
    maxAge: 60,
    sameSite: "lax",
    // The client has to read it; it holds nothing but the notification text.
    httpOnly: false,
  })
}
