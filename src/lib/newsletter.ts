import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { newsletterConfirmationEmail } from "@/emails"
import { appUrl } from "@/emails/layout"
import { query } from "@/lib/db"
import { logger } from "@/lib/logger"
import type { MailMessage } from "@/lib/mail"
import type { Page } from "@/lib/orders"
import { escapeLike } from "@/lib/products"
import type { AdminSubscriberListQuery, SubscriberStatus } from "@/lib/validation/newsletter"

/**
 * Newsletter subscribers. One row per address (case-insensitive). Every sign-up that goes through
 * issues a fresh unsubscribe token (32 random bytes, base64url in the emailed link; only its SHA-256
 * is stored), so only the latest confirmation email's link works. Signing up again within
 * `SUBSCRIBE_COOLDOWN_SECONDS` of the last confirmation changes nothing and sends nothing, so the
 * form can't be used to flood someone's inbox. Callers answer the same whatever the outcome.
 */

const log = logger.child({ scope: "newsletter" })

export const SUBSCRIBE_COOLDOWN_SECONDS = 60

export const hashUnsubscribeToken = (token: string) => createHash("sha256").update(token).digest("hex")

export type SubscribeResult =
  // Subscribed (new, again, or still): email the confirmation with this token's link.
  | { status: "subscribed"; email: string; token: string }
  // A confirmation went out to this address less than a cooldown ago: send nothing.
  | { status: "throttled" }

/** Subscribes the address (any case), or re-subscribes it. `source` names the form, e.g. "home". */
export async function subscribe(email: string, source: string): Promise<SubscribeResult> {
  const normalized = email.trim().toLowerCase()
  const token = randomBytes(32).toString("base64url")
  // The upsert is a single statement, so concurrent sign-ups of one address can't both insert.
  const { rows } = await query<{ email: string }>(
    `INSERT INTO newsletter_subscribers (email, source, unsubscribe_token_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT ((lower(email))) DO UPDATE
       SET status = 'subscribed', source = EXCLUDED.source,
           unsubscribe_token_hash = EXCLUDED.unsubscribe_token_hash,
           confirmation_sent_at = now(), updated_at = now()
       WHERE newsletter_subscribers.status = 'unsubscribed'
          OR newsletter_subscribers.confirmation_sent_at <= now() - make_interval(secs => $4)
     RETURNING email`,
    [normalized, source, hashUnsubscribeToken(token), SUBSCRIBE_COOLDOWN_SECONDS],
  )
  if (rows.length === 0) {
    log.info("Sign-up throttled", { source })
    return { status: "throttled" }
  }
  log.info("Subscribed", { source })
  return { status: "subscribed", email: rows[0].email, token }
}

/** The subscriber an unsubscribe token belongs to, or null for an unknown (or replaced) token. */
export async function findSubscriberByToken(token: string): Promise<{ email: string; status: SubscriberStatus } | null> {
  const { rows } = await query<{ email: string; status: SubscriberStatus }>(
    "SELECT email, status FROM newsletter_subscribers WHERE unsubscribe_token_hash = $1",
    [hashUnsubscribeToken(token)],
  )
  return rows[0] ?? null
}

export type UnsubscribeResult =
  | { status: "unsubscribed" | "already-unsubscribed"; email: string }
  | { status: "invalid" }

/**
 * Unsubscribes the address the token belongs to. Using the link again is harmless
 * (`already-unsubscribed`); an unknown token, or one replaced by a later sign-up, is `invalid`.
 */
export async function unsubscribe(token: string): Promise<UnsubscribeResult> {
  const { rows } = await query<{ email: string; previous: SubscriberStatus }>(
    `WITH target AS (
       SELECT id, status FROM newsletter_subscribers WHERE unsubscribe_token_hash = $1 FOR UPDATE
     )
     UPDATE newsletter_subscribers s
     SET status = 'unsubscribed',
         updated_at = CASE WHEN target.status = 'unsubscribed' THEN s.updated_at ELSE now() END
     FROM target WHERE s.id = target.id
     RETURNING s.email, target.status AS previous`,
    [hashUnsubscribeToken(token)],
  )
  const row = rows[0]
  if (!row) return { status: "invalid" }
  log.info("Unsubscribed", { already: row.previous === "unsubscribed" })
  return { status: row.previous === "unsubscribed" ? "already-unsubscribed" : "unsubscribed", email: row.email }
}

export type Subscriber = {
  id: string
  email: string
  status: SubscriberStatus
  source: string
  createdAt: Date
  updatedAt: Date
}

type SubscriberRow = {
  id: string
  email: string
  status: SubscriberStatus
  source: string
  created_at: Date
  updated_at: Date
}

const toSubscriber = (row: SubscriberRow): Subscriber => ({
  id: row.id,
  email: row.email,
  status: row.status,
  source: row.source,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/** Subscribers for the admin list, newest first, filtered by status and part of the email. */
export async function listSubscribers(options: Partial<AdminSubscriberListQuery> = {}): Promise<Page<Subscriber>> {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 25), 1), 100)
  const page = Math.max(Math.trunc(options.page ?? 1), 1)
  const where: string[] = []
  const params: unknown[] = []
  if (options.status) {
    params.push(options.status)
    where.push(`status = $${params.length}`)
  }
  const q = options.q?.trim()
  if (q) {
    params.push(`%${escapeLike(q)}%`)
    where.push(`email ILIKE $${params.length}`)
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

  const [{ rows }, { rows: count }] = await Promise.all([
    query<SubscriberRow>(
      `SELECT id, email, status, source, created_at, updated_at
       FROM newsletter_subscribers ${whereSql}
       ORDER BY created_at DESC, email
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    ),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM newsletter_subscribers ${whereSql}`, params),
  ])
  const total = count[0].total
  return { items: rows.map(toSubscriber), page, pageSize, total, pageCount: Math.ceil(total / pageSize) }
}

/** How many addresses are subscribed and unsubscribed. */
export async function getSubscriberCounts(): Promise<Record<SubscriberStatus, number>> {
  const { rows } = await query<{ status: SubscriberStatus; count: number }>(
    "SELECT status, count(*)::int AS count FROM newsletter_subscribers GROUP BY status",
  )
  const counts: Record<SubscriberStatus, number> = { subscribed: 0, unsubscribed: 0 }
  for (const row of rows) counts[row.status] = row.count
  return counts
}

/** Every subscribed address, oldest sign-up first, for the CSV export. */
export async function listSubscribedForExport(): Promise<Subscriber[]> {
  const { rows } = await query<SubscriberRow>(
    `SELECT id, email, status, source, created_at, updated_at
     FROM newsletter_subscribers WHERE status = 'subscribed'
     ORDER BY created_at, email`,
  )
  return rows.map(toSubscriber)
}

/** The confirmation email for a sign-up that went through, with its unsubscribe link. */
export function newsletterConfirmationMessage(email: string, token: string): MailMessage {
  return {
    to: email,
    ...newsletterConfirmationEmail({ unsubscribeUrl: appUrl(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`) }),
  }
}
