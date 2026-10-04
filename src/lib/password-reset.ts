import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { query, withTransaction } from "@/lib/db"
import { BadRequestError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { hashPassword } from "@/lib/users"
import { INVALID_RESET_TOKEN_MESSAGE } from "@/lib/validation/password-reset"

/**
 * Password reset tokens. A token is 32 random bytes (base64url in the emailed link); only its
 * SHA-256 is stored. It's valid for `RESET_TOKEN_TTL_MINUTES`, works once, and using it deletes
 * the user's other tokens. Requests are throttled per user: none while a token is younger than
 * `RESET_REQUEST_COOLDOWN_SECONDS`, and no more than `MAX_ACTIVE_RESET_TOKENS` valid at once.
 */

const log = logger.child({ scope: "password-reset" })

export const RESET_TOKEN_TTL_MINUTES = 60
export const RESET_REQUEST_COOLDOWN_SECONDS = 60
export const MAX_ACTIVE_RESET_TOKENS = 3

/** The token is unknown, expired or already used. */
export class InvalidResetTokenError extends BadRequestError {
  constructor() {
    super(INVALID_RESET_TOKEN_MESSAGE)
  }
}

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function generateResetToken() {
  return randomBytes(32).toString("base64url")
}

export type ResetRequest =
  | { status: "created"; token: string; user: { id: string; email: string; firstName: string }; expiresAt: Date }
  | { status: "unknown-email" }
  | { status: "throttled" }

/**
 * Creates a reset token for the account with this email (any case). Callers must answer the same
 * way whatever the outcome, so nobody can tell which emails have accounts.
 */
export async function requestPasswordReset(email: string): Promise<ResetRequest> {
  return withTransaction(async (client) => {
    // Locking the user serialises concurrent requests, so the throttle can't be raced.
    const { rows: users } = await client.query<{ id: string; email: string; first_name: string }>(
      "SELECT id, email, first_name FROM users WHERE lower(email) = lower($1) FOR UPDATE",
      [email.trim()],
    )
    const user = users[0]
    if (!user) {
      log.info("Reset requested for an unknown email")
      return { status: "unknown-email" }
    }

    const { rows: recent } = await client.query<{ active: number; recent: number }>(
      `SELECT count(*) FILTER (WHERE used_at IS NULL AND expires_at > now())::int AS active,
              count(*) FILTER (WHERE created_at > now() - make_interval(secs => $2))::int AS recent
       FROM password_reset_tokens WHERE user_id = $1`,
      [user.id, RESET_REQUEST_COOLDOWN_SECONDS],
    )
    if (recent[0].recent > 0 || recent[0].active >= MAX_ACTIVE_RESET_TOKENS) {
      log.info("Reset request throttled", { userId: user.id, ...recent[0] })
      return { status: "throttled" }
    }

    const token = generateResetToken()
    const { rows } = await client.query<{ expires_at: Date }>(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3))
       RETURNING expires_at`,
      [user.id, hashResetToken(token), RESET_TOKEN_TTL_MINUTES],
    )
    log.info("Reset token created", { userId: user.id })
    return {
      status: "created",
      token,
      user: { id: user.id, email: user.email, firstName: user.first_name },
      expiresAt: rows[0].expires_at,
    }
  })
}

/** Whether the token can still be used (exists, unused, not expired), without using it. */
export async function isResetTokenValid(token: string) {
  const { rows } = await query(
    "SELECT 1 FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
    [hashResetToken(token)],
  )
  return rows.length > 0
}

/**
 * Sets a new password with a reset token: marks the token used and deletes the user's other
 * tokens, in one transaction. Returns the account's id and email.
 *
 * @throws InvalidResetTokenError when the token is unknown, expired or already used.
 */
export async function resetPassword(token: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword)
  const user = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string; user_id: string; valid: boolean }>(
      `SELECT id, user_id, (used_at IS NULL AND expires_at > now()) AS valid
       FROM password_reset_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hashResetToken(token)],
    )
    const row = rows[0]
    if (!row?.valid) throw new InvalidResetTokenError()

    const { rows: users } = await client.query<{ id: string; email: string }>(
      "UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING id, email",
      [row.user_id, passwordHash],
    )
    await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [row.id])
    await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1 AND id <> $2", [row.user_id, row.id])
    return users[0]
  })
  log.info("Password reset", { userId: user.id })
  return user
}
