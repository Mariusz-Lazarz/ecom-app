import "server-only"

import type { PoolClient } from "pg"

import { query, withTransaction } from "@/lib/db"
import { ConflictError, NotFoundError } from "@/lib/errors"
import type { OrderAddress } from "@/lib/orders"
import { MAX_ADDRESSES, type SavedAddressInput } from "@/lib/validation/addresses"

/**
 * Addresses a customer saved to their account (`addresses`), up to MAX_ADDRESSES each, at most one
 * of them the default that checkout preselects.
 *
 * Every function takes the owner's id and only ever touches that user's rows: someone else's
 * address id behaves like one that doesn't exist. Default handling: the first address saved
 * becomes the default, and deleting the default promotes the oldest remaining one, so a user with
 * addresses always has a default. Writes lock the user's row first, which serialises them per user
 * (the limit check and the default switch can't race).
 *
 * None of these read the session: callers (Server Actions, pages) pass the user id.
 */

export type SavedAddress = OrderAddress & {
  id: string
  label: string
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

export class AddressLimitError extends ConflictError {
  constructor() {
    super(`You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.`)
  }
}

export class AddressNotFoundError extends NotFoundError {
  constructor() {
    super("Address not found.")
  }
}

type AddressRow = {
  id: string
  label: string
  full_name: string
  line1: string
  line2: string | null
  city: string
  postal_code: string
  country: string
  phone: string
  is_default: boolean
  created_at: Date
  updated_at: Date
}

const COLUMNS = `id, label, full_name, line1, line2, city, postal_code, country, phone, is_default, created_at, updated_at`

function toAddress(row: AddressRow): SavedAddress {
  return {
    id: row.id,
    label: row.label,
    fullName: row.full_name,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    postalCode: row.postal_code,
    country: row.country,
    phone: row.phone,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function lockUser(client: PoolClient, userId: string) {
  const { rows } = await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId])
  if (rows.length === 0) throw new NotFoundError("Account not found.")
}

async function clearDefault(client: PoolClient, userId: string) {
  // Separate from setting the new default: the partial unique index is checked row by row.
  await client.query("UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default", [userId])
}

/** The user's saved addresses: the default first, then oldest first. */
export async function listAddresses(userId: string): Promise<SavedAddress[]> {
  const { rows } = await query<AddressRow>(
    `SELECT ${COLUMNS} FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at, id`,
    [userId],
  )
  return rows.map(toAddress)
}

/** One of the user's addresses, or null when it doesn't exist or belongs to someone else. */
export async function getAddress(userId: string, id: string): Promise<SavedAddress | null> {
  const { rows } = await query<AddressRow>(`SELECT ${COLUMNS} FROM addresses WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ])
  return rows[0] ? toAddress(rows[0]) : null
}

/**
 * Saves a new address. It becomes the default when `makeDefault` is set or it's the user's first.
 *
 * @throws AddressLimitError when the user already has MAX_ADDRESSES.
 * @throws NotFoundError when the user doesn't exist.
 */
export async function createAddress(
  userId: string,
  input: SavedAddressInput,
  { makeDefault = false }: { makeDefault?: boolean } = {},
): Promise<SavedAddress> {
  return withTransaction(async (client) => {
    await lockUser(client, userId)
    const { rows: counts } = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM addresses WHERE user_id = $1",
      [userId],
    )
    const count = counts[0].n
    if (count >= MAX_ADDRESSES) throw new AddressLimitError()

    const isDefault = makeDefault || count === 0
    if (isDefault) await clearDefault(client, userId)
    const { rows } = await client.query<AddressRow>(
      `INSERT INTO addresses (user_id, label, full_name, line1, line2, city, postal_code, country, phone, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.label,
        input.fullName,
        input.line1,
        input.line2,
        input.city,
        input.postalCode,
        input.country,
        input.phone,
        isDefault,
      ],
    )
    return toAddress(rows[0])
  })
}

/**
 * Replaces one of the user's addresses (its default flag stays as it was).
 *
 * @throws AddressNotFoundError when it doesn't exist or belongs to someone else.
 */
export async function updateAddress(userId: string, id: string, input: SavedAddressInput): Promise<SavedAddress> {
  const { rows } = await query<AddressRow>(
    `UPDATE addresses
     SET label = $3, full_name = $4, line1 = $5, line2 = $6, city = $7, postal_code = $8, country = $9, phone = $10,
         updated_at = clock_timestamp()
     WHERE id = $1 AND user_id = $2
     RETURNING ${COLUMNS}`,
    [id, userId, input.label, input.fullName, input.line1, input.line2, input.city, input.postalCode, input.country, input.phone],
  )
  if (!rows[0]) throw new AddressNotFoundError()
  return toAddress(rows[0])
}

/**
 * Makes one of the user's addresses the default, and the others not.
 *
 * @throws AddressNotFoundError when it doesn't exist or belongs to someone else.
 */
export async function setDefaultAddress(userId: string, id: string): Promise<void> {
  await withTransaction(async (client) => {
    await lockUser(client, userId)
    const { rows } = await client.query("SELECT 1 FROM addresses WHERE id = $1 AND user_id = $2", [id, userId])
    if (rows.length === 0) throw new AddressNotFoundError()
    await clearDefault(client, userId)
    await client.query("UPDATE addresses SET is_default = true, updated_at = clock_timestamp() WHERE id = $1", [id])
  })
}

/**
 * Deletes one of the user's addresses. When it was the default, the oldest remaining address
 * becomes the default.
 *
 * @throws AddressNotFoundError when it doesn't exist or belongs to someone else.
 */
export async function deleteAddress(userId: string, id: string): Promise<void> {
  await withTransaction(async (client) => {
    await lockUser(client, userId)
    const { rows } = await client.query<{ is_default: boolean }>(
      "DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING is_default",
      [id, userId],
    )
    if (rows.length === 0) throw new AddressNotFoundError()
    if (rows[0].is_default) {
      await client.query(
        `UPDATE addresses SET is_default = true, updated_at = clock_timestamp()
         WHERE id = (SELECT id FROM addresses WHERE user_id = $1 ORDER BY created_at, id LIMIT 1)`,
        [userId],
      )
    }
  })
}
