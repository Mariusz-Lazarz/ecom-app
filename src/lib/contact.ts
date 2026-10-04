import "server-only"

import { createHash } from "node:crypto"

import { query, withTransaction } from "@/lib/db"
import { AppError, NotFoundError, ValidationError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import type { Page } from "@/lib/orders"
import { escapeLike } from "@/lib/products"
import type {
  AdminMessageListQuery,
  ContactInput,
  ContactMessageStatus,
  ContactTopic,
} from "@/lib/validation/contact"

/**
 * Contact form messages. Callers pass the signed-in user's id (or null) and the client IP; this
 * module never reads the session. A signed-in sender's order number must be one of their orders; a
 * guest's is stored as typed. One message per email address, account or IP per
 * `CONTACT_RATE_LIMIT_SECONDS`. Only the IP's SHA-256 is stored.
 */

const log = logger.child({ scope: "contact" })

export const CONTACT_RATE_LIMIT_SECONDS = 60

export const RATE_LIMIT_MESSAGE = "You've just sent us a message. Please wait a minute before sending another."
export const ORDER_NOT_FOUND_MESSAGE = "We couldn't find this order on your account. Check the number, or leave it blank."

/** The sender (by email, account or IP) sent a message less than a minute ago. */
export class ContactRateLimitError extends AppError {
  constructor() {
    super(RATE_LIMIT_MESSAGE, 429, "rate_limited")
  }
}

/** A signed-in sender gave an order number that isn't one of theirs. */
export class ContactOrderNotFoundError extends ValidationError {
  constructor() {
    super({ orderNumber: [ORDER_NOT_FOUND_MESSAGE] }, ORDER_NOT_FOUND_MESSAGE)
  }
}

export const hashIp = (ip: string) => createHash("sha256").update(ip).digest("hex")

export type ContactMessage = {
  id: string
  name: string
  email: string
  orderNumber: string | null
  topic: ContactTopic
  message: string
  status: ContactMessageStatus
  // The sender's account when they were signed in (null for guests and deleted accounts).
  userId: string | null
  createdAt: Date
  updatedAt: Date
}

export type ContactMessageDetail = ContactMessage & {
  // Whether an order with this number exists (anyone's), so the admin page can link to it.
  orderExists: boolean
}

type MessageRow = {
  id: string
  name: string
  email: string
  order_number: string | null
  topic: ContactTopic
  message: string
  status: ContactMessageStatus
  user_id: string | null
  created_at: Date
  updated_at: Date
}

const COLUMNS = "m.id, m.name, m.email, m.order_number, m.topic, m.message, m.status, m.user_id, m.created_at, m.updated_at"

const toMessage = (row: MessageRow): ContactMessage => ({
  id: row.id,
  name: row.name,
  email: row.email,
  orderNumber: row.order_number,
  topic: row.topic,
  message: row.message,
  status: row.status,
  userId: row.user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * Stores a message from the contact form.
 *
 * @throws ContactOrderNotFoundError when a signed-in sender's order number isn't one of theirs.
 * @throws ContactRateLimitError when the email, account or IP sent a message in the last minute.
 */
export async function createContactMessage(
  input: ContactInput,
  { userId, ip }: { userId: string | null; ip: string | null },
): Promise<ContactMessage> {
  const email = input.email.trim().toLowerCase()
  const ipHash = ip ? hashIp(ip) : null
  const message = await withTransaction(async (client) => {
    // Serialises messages from one address, so two quick submits can't both pass the rate limit.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('contact:' || $1))", [email])

    if (userId && input.orderNumber) {
      const { rows } = await client.query("SELECT 1 FROM orders WHERE user_id = $1 AND number = upper($2)", [
        userId,
        input.orderNumber,
      ])
      if (rows.length === 0) throw new ContactOrderNotFoundError()
    }

    const { rows: recent } = await client.query(
      `SELECT 1 FROM contact_messages
       WHERE created_at > now() - make_interval(secs => $4)
         AND (lower(email) = $1 OR ($2::text IS NOT NULL AND ip_hash = $2) OR ($3::uuid IS NOT NULL AND user_id = $3))
       LIMIT 1`,
      [email, ipHash, userId, CONTACT_RATE_LIMIT_SECONDS],
    )
    if (recent.length > 0) throw new ContactRateLimitError()

    const { rows } = await client.query<MessageRow>(
      `INSERT INTO contact_messages AS m (user_id, name, email, order_number, topic, message, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [userId, input.name, email, input.orderNumber?.toUpperCase() ?? null, input.topic, input.message, ipHash],
    )
    return toMessage(rows[0])
  })
  log.info("Contact message stored", { id: message.id, topic: message.topic, signedIn: Boolean(userId) })
  return message
}

/** Messages for the admin list, newest first. `q` matches the name, email, order number or message. */
export async function listContactMessages(
  options: Partial<AdminMessageListQuery> = {},
): Promise<Page<ContactMessage>> {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 20), 1), 100)
  const page = Math.max(Math.trunc(options.page ?? 1), 1)
  const where: string[] = []
  const params: unknown[] = []
  if (options.status) {
    params.push(options.status)
    where.push(`m.status = $${params.length}`)
  }
  const q = options.q?.trim()
  if (q) {
    params.push(`%${escapeLike(q)}%`)
    const p = `$${params.length}`
    where.push(`(m.name ILIKE ${p} OR m.email ILIKE ${p} OR m.order_number ILIKE ${p} OR m.message ILIKE ${p})`)
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

  const [{ rows }, { rows: count }] = await Promise.all([
    query<MessageRow>(
      `SELECT ${COLUMNS} FROM contact_messages m ${whereSql}
       ORDER BY m.created_at DESC, m.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    ),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM contact_messages m ${whereSql}`, params),
  ])
  const total = count[0].total
  return { items: rows.map(toMessage), page, pageSize, total, pageCount: Math.ceil(total / pageSize) }
}

/** How many messages have each status. */
export async function getContactMessageCounts(): Promise<Record<ContactMessageStatus, number>> {
  const { rows } = await query<{ status: ContactMessageStatus; count: number }>(
    "SELECT status, count(*)::int AS count FROM contact_messages GROUP BY status",
  )
  const counts: Record<ContactMessageStatus, number> = { new: 0, read: 0, archived: 0 }
  for (const row of rows) counts[row.status] = row.count
  return counts
}

/** How many messages nobody has read yet (the admin nav's badge). */
export async function countNewContactMessages(): Promise<number> {
  const { rows } = await query<{ count: number }>("SELECT count(*)::int AS count FROM contact_messages WHERE status = 'new'")
  return rows[0].count
}

/** The newest unread messages, newest first (the admin dashboard's card). */
export async function listNewContactMessages(limit = 5): Promise<ContactMessage[]> {
  const { rows } = await query<MessageRow>(
    `SELECT ${COLUMNS} FROM contact_messages m WHERE m.status = 'new' ORDER BY m.created_at DESC, m.id LIMIT $1`,
    [Math.min(Math.max(Math.trunc(limit), 1), 100)],
  )
  return rows.map(toMessage)
}

/** One message, or null for an unknown id. */
export async function getContactMessage(id: string): Promise<ContactMessageDetail | null> {
  const { rows } = await query<MessageRow & { order_exists: boolean }>(
    `SELECT ${COLUMNS},
            (m.order_number IS NOT NULL AND EXISTS (SELECT 1 FROM orders o WHERE o.number = m.order_number)) AS order_exists
     FROM contact_messages m WHERE m.id = $1`,
    [id],
  )
  const row = rows[0]
  return row ? { ...toMessage(row), orderExists: row.order_exists } : null
}

/**
 * Sets a message's status (any status to any other).
 *
 * @throws NotFoundError for an unknown id.
 */
export async function setContactMessageStatus(id: string, status: ContactMessageStatus): Promise<ContactMessage> {
  const { rows } = await query<MessageRow>(
    `UPDATE contact_messages m
     SET status = $2, updated_at = CASE WHEN m.status = $2 THEN m.updated_at ELSE now() END
     WHERE m.id = $1 RETURNING ${COLUMNS}`,
    [id, status],
  )
  if (!rows[0]) throw new NotFoundError("This message no longer exists.")
  log.info("Contact message status changed", { id, status })
  return toMessage(rows[0])
}
