"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

import { FLASH_COOKIE, parseNotification } from "@/lib/notifications"
import { notify } from "@/lib/notify"

/** Reads the flash cookie set by `flash()`, deletes it and shows it as a toast. */
export function consumeFlash() {
  const prefix = `${FLASH_COOKIE}=`
  const cookie = document.cookie.split("; ").find((c) => c.startsWith(prefix))
  if (!cookie) return

  // Deleting before showing means a second call in the same tick finds nothing, so the toast appears once.
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`

  let raw: string
  try {
    raw = decodeURIComponent(cookie.slice(prefix.length))
  } catch {
    return
  }
  const notification = parseNotification(raw)
  if (notification) notify.show(notification)
}

/**
 * Shows notifications queued with `flash()`. It checks on first load and after every navigation,
 * which covers Server Actions that redirect, and listens for cookie changes (where the Cookie Store
 * API exists) to pick up actions that stay on the same page.
 */
export function FlashToaster() {
  const pathname = usePathname()

  useEffect(() => {
    consumeFlash()
  }, [pathname])

  useEffect(() => {
    const store = (globalThis as { cookieStore?: EventTarget }).cookieStore
    if (!store) return
    store.addEventListener("change", consumeFlash)
    return () => store.removeEventListener("change", consumeFlash)
  }, [])

  return null
}
