import * as z from "zod"

import { EmailSchema } from "@/lib/validation/register"

/** The newsletter sign-up form (field: email). */
export const NewsletterSchema = z.object({ email: EmailSchema })

export type NewsletterFormState =
  | { success: true; email: string }
  | { success?: false; errors?: { email?: string[] }; message?: string; values?: { email?: string } }
  | undefined

/** An unsubscribe token as it appears in the emailed link (32 random bytes, base64url). */
export const UnsubscribeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

export const INVALID_UNSUBSCRIBE_LINK_MESSAGE =
  "This unsubscribe link isn't valid any more. It may be from an older email: use the link in the latest one, or contact us."

export const SUBSCRIBER_STATUSES = ["subscribed", "unsubscribed"] as const
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number]

// Query strings arrive as strings, or arrays when a key repeats; empty ones count as not set.
const param = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => {
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first !== "string") return first
    const trimmed = first.trim()
    return trimmed === "" ? undefined : trimmed
  }, schema)

export const DEFAULT_ADMIN_SUBSCRIBERS_PAGE_SIZE = 25

/** The admin subscriber list's filters as they come from a URL (`searchParams`). */
export const AdminSubscriberListQuerySchema = z.object({
  status: param(z.enum(SUBSCRIBER_STATUSES).optional()),
  // Part of the email address.
  q: param(z.string().max(100).optional()),
  page: param(z.coerce.number().int().min(1).max(1000).default(1)),
  pageSize: param(z.coerce.number().int().min(1).max(100).default(DEFAULT_ADMIN_SUBSCRIBERS_PAGE_SIZE)),
})

export type AdminSubscriberListQuery = z.output<typeof AdminSubscriberListQuerySchema>
