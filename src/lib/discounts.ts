import "server-only"

import type { PoolClient, QueryResult, QueryResultRow } from "pg"

import { query, withTransaction } from "@/lib/db"
import { ConflictError, NotFoundError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import {
  discountProblemMessage,
  normalizeDiscountCode,
  type DiscountCodeState,
  type DiscountProblem,
  type DiscountType,
} from "@/lib/order-rules"
import type { DiscountCodeInput } from "@/lib/validation/discounts"

/**
 * Discount codes: loading one with its redemption counts for the cart and `placeOrder`, and the
 * admin's list and edits. The rules for applying a code live in `@/lib/order-rules`
 * (`checkDiscountCode`, `quoteCheckout`).
 *
 * A redemption is written by `placeOrder` and deleted when its order is cancelled or rejected, so
 * the counts only include orders that still stand. A code with redemptions can't be deleted (the
 * foreign key restricts it); it can be deactivated.
 *
 * None of these read the session: callers pass the user id and check roles.
 */

const log = logger.child({ scope: "discounts" })

const UNIQUE_VIOLATION = "23505"
const FOREIGN_KEY_VIOLATION = "23503"

type Run = <T extends QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<T>>

export type DiscountCode = {
  id: string
  code: string
  description: string
  type: DiscountType
  value: number
  minSubtotalCents: number
  startsAt: Date | null
  endsAt: Date | null
  maxRedemptions: number | null
  perUserLimit: number | null
  active: boolean
  createdAt: Date
  // Redemptions by orders that weren't cancelled or rejected.
  redemptionCount: number
}

/** A code that can't be applied (unknown, expired, limits reached…); the message says why. Nothing was written. */
export class DiscountCodeError extends ConflictError {
  readonly discountCode: string
  constructor(
    code: string,
    readonly problem: DiscountProblem,
    currency = "USD",
  ) {
    super(discountProblemMessage(normalizeDiscountCode(code), problem, currency))
    this.discountCode = normalizeDiscountCode(code)
  }
}

/** The code is already taken by another discount code. */
export class CodeTakenError extends ConflictError {
  readonly field = "code"
  constructor() {
    super("Another discount code already uses this code.")
  }
}

/** The code has been redeemed, so it can only be deactivated. */
export class CodeInUseError extends ConflictError {
  constructor(readonly redemptionCount: number) {
    super(
      `This code has been used ${redemptionCount} ${redemptionCount === 1 ? "time" : "times"}, so it can't be deleted. Deactivate it instead.`,
    )
  }
}

type CodeRow = {
  id: string
  code: string
  description: string
  type: DiscountType
  value: number
  min_subtotal_cents: number
  starts_at: Date | null
  ends_at: Date | null
  max_redemptions: number | null
  per_user_limit: number | null
  active: boolean
  created_at: Date
  redemption_count: number
}

const CODE_COLUMNS = `
  d.id, d.code, d.description, d.type, d.value, d.min_subtotal_cents, d.starts_at, d.ends_at,
  d.max_redemptions, d.per_user_limit, d.active, d.created_at,
  (SELECT count(*)::int FROM discount_redemptions r WHERE r.code_id = d.id) AS redemption_count`

function toDiscountCode(row: CodeRow): DiscountCode {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    type: row.type,
    value: row.value,
    minSubtotalCents: row.min_subtotal_cents,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxRedemptions: row.max_redemptions,
    perUserLimit: row.per_user_limit,
    active: row.active,
    createdAt: row.created_at,
    redemptionCount: row.redemption_count,
  }
}

// ── Applying codes ───────────────────────────────────────────────────────────────────────────────

export type LoadedDiscountCode = DiscountCodeState & { id: string }

/**
 * A code (matched case-insensitively) with its redemption counts overall and for `userId`, or
 * null when there's no such code. With `lock` (inside a transaction) the code row is locked
 * first, so concurrent checkouts with the same code count redemptions one at a time.
 */
export async function loadDiscountCode(
  code: string,
  userId: string,
  { client, lock = false }: { client?: PoolClient; lock?: boolean } = {},
): Promise<LoadedDiscountCode | null> {
  const run: Run = client ? (text, params) => client.query(text, params) : query
  const { rows } = await run<Omit<CodeRow, "redemption_count" | "description" | "created_at">>(
    `SELECT id, code, type, value, min_subtotal_cents, starts_at, ends_at, max_redemptions, per_user_limit, active
     FROM discount_codes WHERE code = $1 ${lock ? "FOR UPDATE" : ""}`,
    [normalizeDiscountCode(code)],
  )
  const row = rows[0]
  if (!row) return null
  // Counted after the lock, so this sees every redemption committed before it was granted.
  const { rows: counts } = await run<{ total: number; mine: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE user_id = $2)::int AS mine
     FROM discount_redemptions WHERE code_id = $1`,
    [row.id, userId],
  )
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.value,
    minSubtotalCents: row.min_subtotal_cents,
    active: row.active,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxRedemptions: row.max_redemptions,
    perUserLimit: row.per_user_limit,
    redemptionCount: counts[0].total,
    userRedemptionCount: counts[0].mine,
  }
}

// ── Admin ────────────────────────────────────────────────────────────────────────────────────────

/** Every code, newest first. */
export async function listDiscountCodes(): Promise<DiscountCode[]> {
  const { rows } = await query<CodeRow>(`SELECT ${CODE_COLUMNS} FROM discount_codes d ORDER BY d.created_at DESC, d.code`)
  return rows.map(toDiscountCode)
}

/** One code by id, or null. */
export async function getDiscountCode(id: string): Promise<DiscountCode | null> {
  const { rows } = await query<CodeRow>(`SELECT ${CODE_COLUMNS} FROM discount_codes d WHERE d.id = $1`, [id])
  return rows[0] ? toDiscountCode(rows[0]) : null
}

function rethrowConstraint(err: unknown): never {
  const { code, constraint } = (err ?? {}) as { code?: string; constraint?: string }
  if (code === UNIQUE_VIOLATION && constraint === "discount_codes_code_key") throw new CodeTakenError()
  throw err
}

const inputParams = (input: DiscountCodeInput) => [
  input.code,
  input.description,
  input.type,
  input.value,
  input.minSubtotalCents,
  input.startsAt,
  input.endsAt,
  input.maxRedemptions,
  input.perUserLimit,
  input.active,
]

/** Creates a code. @throws CodeTakenError when the code is in use. */
export async function createDiscountCode(input: DiscountCodeInput): Promise<{ id: string; code: string }> {
  try {
    const { rows } = await query<{ id: string; code: string }>(
      `INSERT INTO discount_codes (code, description, type, value, min_subtotal_cents, starts_at, ends_at,
                                   max_redemptions, per_user_limit, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, code`,
      inputParams(input),
    )
    log.info("Discount code created", { code: rows[0].code })
    return rows[0]
  } catch (err) {
    rethrowConstraint(err)
  }
}

/**
 * Updates a code. Orders keep the code and amount they were placed with; carts holding the old
 * code text drop it on their next read.
 *
 * @throws NotFoundError when there's no such code.
 * @throws CodeTakenError when the new code is in use.
 */
export async function updateDiscountCode(id: string, input: DiscountCodeInput): Promise<{ id: string; code: string }> {
  try {
    const { rows } = await query<{ id: string; code: string }>(
      `UPDATE discount_codes
       SET code = $2, description = $3, type = $4, value = $5, min_subtotal_cents = $6, starts_at = $7,
           ends_at = $8, max_redemptions = $9, per_user_limit = $10, active = $11
       WHERE id = $1
       RETURNING id, code`,
      [id, ...inputParams(input)],
    )
    if (!rows[0]) throw new NotFoundError("This discount code no longer exists.")
    log.info("Discount code updated", { code: rows[0].code })
    return rows[0]
  } catch (err) {
    rethrowConstraint(err)
  }
}

/** Turns a code on or off. @throws NotFoundError when there's no such code. */
export async function setDiscountCodeActive(id: string, active: boolean): Promise<{ code: string; active: boolean }> {
  const { rows } = await query<{ code: string; active: boolean }>(
    "UPDATE discount_codes SET active = $2 WHERE id = $1 RETURNING code, active",
    [id, active],
  )
  if (!rows[0]) throw new NotFoundError("This discount code no longer exists.")
  log.info("Discount code toggled", rows[0])
  return rows[0]
}

/**
 * Deletes a code that has never been redeemed (by an order that still stands).
 *
 * @throws NotFoundError when there's no such code.
 * @throws CodeInUseError when it has redemptions.
 */
export async function deleteDiscountCode(id: string): Promise<{ code: string }> {
  const deleted = await withTransaction(async (client) => {
    // The lock makes a checkout redeeming the code right now either finish first (and be counted)
    // or wait and then find the code gone.
    const { rows } = await client.query<{ code: string }>("SELECT code FROM discount_codes WHERE id = $1 FOR UPDATE", [id])
    if (!rows[0]) throw new NotFoundError("This discount code no longer exists.")
    const { rows: counts } = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM discount_redemptions WHERE code_id = $1",
      [id],
    )
    if (counts[0].n > 0) throw new CodeInUseError(counts[0].n)
    try {
      await client.query("DELETE FROM discount_codes WHERE id = $1", [id])
    } catch (err) {
      if ((err as { code?: string }).code === FOREIGN_KEY_VIOLATION) throw new CodeInUseError(1)
      throw err
    }
    return rows[0]
  })
  log.info("Discount code deleted", deleted)
  return deleted
}
