export const NOTIFICATION_TYPES = ["success", "error", "warning", "info"] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export type Notification = {
  type: NotificationType
  title: string
  description?: string
}

/** Cookie that carries a flash notification from a Server Action to the next page the browser shows. */
export const FLASH_COOKIE = "flash"

/** Parses a raw flash cookie value, returning null for anything that isn't a well-formed notification. */
export function parseNotification(raw: string): Notification | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null) return null

  const { type, title, description } = value as Record<string, unknown>
  if (!NOTIFICATION_TYPES.includes(type as NotificationType)) return null
  if (typeof title !== "string" || title === "") return null
  if (description !== undefined && typeof description !== "string") return null

  return { type: type as NotificationType, title, ...(description !== undefined && { description }) }
}
