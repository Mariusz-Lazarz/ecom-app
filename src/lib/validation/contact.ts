import * as z from "zod"

import { EmailSchema } from "@/lib/validation/register"

export const CONTACT_TOPICS = [
  { value: "order", label: "An order" },
  { value: "returns", label: "Returns & refunds" },
  { value: "shipping", label: "Shipping & delivery" },
  { value: "payment", label: "Payments" },
  { value: "product", label: "A product" },
  { value: "other", label: "Something else" },
] as const

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["value"]

const TOPIC_VALUES = CONTACT_TOPICS.map((topic) => topic.value) as [ContactTopic, ...ContactTopic[]]

export const contactTopicLabel = (topic: ContactTopic) =>
  CONTACT_TOPICS.find((t) => t.value === topic)?.label ?? topic

export const CONTACT_MESSAGE_MIN = 10
export const CONTACT_MESSAGE_MAX = 2000

/**
 * The contact form. The order number is optional (blank counts as none) and upper-cased; whether it
 * belongs to the sender is checked by `@/lib/contact` for signed-in senders.
 */
export const ContactSchema = z.object({
  name: z.string().trim().min(1, { error: "Please tell us your name." }).max(100, { error: "Keep your name under 100 characters." })
    // One line: the name goes into email subjects.
    .transform((value) => value.replace(/\s+/g, " ")),
  email: EmailSchema,
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .max(30, { error: "That doesn't look like an order number." })
    .transform((value) => value || undefined)
    .optional(),
  topic: z.enum(TOPIC_VALUES, { error: "Choose what your message is about." }),
  message: z
    .string()
    .trim()
    .min(CONTACT_MESSAGE_MIN, { error: `Write at least ${CONTACT_MESSAGE_MIN} characters.` })
    .max(CONTACT_MESSAGE_MAX, { error: `Keep it under ${CONTACT_MESSAGE_MAX} characters.` }),
})

export type ContactInput = z.output<typeof ContactSchema>
export type ContactField = keyof ContactInput

export type ContactFormState =
  | { success: true; name: string; email: string }
  | {
      success?: false
      errors?: Partial<Record<ContactField, string[]>>
      message?: string
      values?: Partial<Record<ContactField, string>>
    }
  | undefined

/** The honeypot's field name: hidden from people, so only bots fill it in. */
export const CONTACT_HONEYPOT_FIELD = "website"

export const CONTACT_MESSAGE_STATUSES = ["new", "read", "archived"] as const
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number]

export const CONTACT_MESSAGE_STATUS_LABELS: Record<ContactMessageStatus, string> = {
  new: "New",
  read: "Read",
  archived: "Archived",
}

// Query strings arrive as strings, or arrays when a key repeats; empty ones count as not set.
const param = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => {
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first !== "string") return first
    const trimmed = first.trim()
    return trimmed === "" ? undefined : trimmed
  }, schema)

export const DEFAULT_ADMIN_MESSAGES_PAGE_SIZE = 20

/** The admin message list's filters as they come from a URL (`searchParams`). */
export const AdminMessageListQuerySchema = z.object({
  status: param(z.enum(CONTACT_MESSAGE_STATUSES).optional()),
  // Matches the sender's name or email, the order number or the message.
  q: param(z.string().max(100).optional()),
  page: param(z.coerce.number().int().min(1).max(1000).default(1)),
  pageSize: param(z.coerce.number().int().min(1).max(100).default(DEFAULT_ADMIN_MESSAGES_PAGE_SIZE)),
})

export type AdminMessageListQuery = z.output<typeof AdminMessageListQuerySchema>
