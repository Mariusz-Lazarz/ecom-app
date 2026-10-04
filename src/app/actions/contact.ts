"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { refresh } from "next/cache"
import * as z from "zod"

import { auth } from "@/auth"
import { contactAutoReplyEmail, contactNotificationEmail } from "@/emails"
import * as contact from "@/lib/contact"
import { AppError, ForbiddenError, GENERIC_MESSAGE, logError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { sendMailLater, supportInbox } from "@/lib/mail"
import { loginHref } from "@/lib/safe-redirect"
import {
  CONTACT_HONEYPOT_FIELD,
  CONTACT_MESSAGE_STATUSES,
  ContactSchema,
  type ContactField,
  type ContactFormState,
  type ContactMessageStatus,
} from "@/lib/validation/contact"

/**
 * Contact Server Actions. `sendContactMessage` (for `useActionState`) stores the message for the
 * signed-in user or a guest, then emails an auto-reply to the sender and a notification to
 * `supportInbox()` after the response. A filled-in honeypot field gets the same success answer but
 * nothing is stored or sent. `setContactMessageStatus` is admin-only and re-checks the role.
 */

const log = logger.child({ scope: "contact" })

const FIELDS = ["name", "email", "orderNumber", "topic", "message"] as const satisfies readonly ContactField[]

const field = (formData: FormData, name: string) => {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

/** The client's IP, from the proxy headers (first hop of `x-forwarded-for`), or null when unknown. */
async function clientIp() {
  const list = await headers()
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || list.get("x-real-ip")?.trim() || null
}

/** Sends a message from the contact form (fields: name, email, orderNumber, topic, message, and the honeypot). */
export async function sendContactMessage(_state: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const values = Object.fromEntries(FIELDS.map((name) => [name, field(formData, name)])) as Record<ContactField, string>

  if (field(formData, CONTACT_HONEYPOT_FIELD).trim()) {
    log.info("Contact message dropped: honeypot filled in")
    return { success: true, name: values.name.trim(), email: values.email.trim() }
  }

  const parsed = ContactSchema.safeParse(values)
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  try {
    const session = await auth()
    const message = await contact.createContactMessage(parsed.data, {
      userId: session?.user?.id ?? null,
      ip: await clientIp(),
    })
    sendMailLater("contact.auto-reply", () => ({ to: message.email, ...contactAutoReplyEmail(message) }))
    sendMailLater("contact.notification", () => ({ to: supportInbox(), ...contactNotificationEmail(message) }))
    return { success: true, name: message.name, email: message.email }
  } catch (err) {
    if (err instanceof contact.ContactOrderNotFoundError) {
      return { errors: err.fieldErrors as Partial<Record<ContactField, string[]>>, values }
    }
    if (err instanceof contact.ContactRateLimitError) return { message: err.message, values }
    logError(err, "contact.send")
    return { message: GENERIC_MESSAGE, values }
  }
}

export type ContactAdminResult = { ok: boolean; message: string }

const NO_ACCESS = "You don't have access to this action."
const STATUS_MESSAGES: Record<ContactMessageStatus, string> = {
  new: "The message is marked as unread.",
  read: "The message is marked as read.",
  archived: "The message is archived.",
}

/** Marks a message new (unread), read or archived (admins only). */
export async function setContactMessageStatus(id: string, status: ContactMessageStatus): Promise<ContactAdminResult> {
  const scope = "contact.status"
  const session = await auth()
  if (!session?.user?.id) redirect(loginHref("/admin/messages"))
  if (session.user.role !== "admin") {
    logError(new ForbiddenError("Message status change by a non-admin"), scope)
    return { ok: false, message: NO_ACCESS }
  }
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "This message no longer exists." }
  if (!CONTACT_MESSAGE_STATUSES.includes(status)) return { ok: false, message: "Choose a valid status." }

  try {
    await contact.setContactMessageStatus(id, status)
  } catch (err) {
    logError(err, scope)
    return { ok: false, message: err instanceof AppError && err.status < 500 ? err.message : GENERIC_MESSAGE }
  }
  refresh()
  return { ok: true, message: STATUS_MESSAGES[status] }
}
