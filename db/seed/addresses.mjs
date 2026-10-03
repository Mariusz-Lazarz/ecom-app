import { ADMIN } from "./admin.mjs"
import { CUSTOMERS } from "./customer.mjs"
import { ADMIN_ADDRESS } from "./orders.mjs"

// The label the seeded address is saved under; it identifies the seeded row on re-runs.
export const SEED_ADDRESS_LABEL = "Home"

/**
 * Saves `address` as the user's "Home" address and makes it their default: updates the existing
 * "Home" row (so re-runs never duplicate it) or inserts one. Other saved addresses are kept but
 * stop being the default. Returns the row's id.
 */
export async function upsertHomeAddress(client, userId, fullName, address) {
  await client.query("BEGIN")
  try {
    await client.query("UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default", [userId])
    const values = [
      userId,
      SEED_ADDRESS_LABEL,
      fullName,
      address.line1,
      address.line2,
      address.city,
      address.postalCode,
      address.country,
      address.phone,
    ]
    const updated = await client.query(
      `UPDATE addresses
       SET full_name = $3, line1 = $4, line2 = $5, city = $6, postal_code = $7, country = $8, phone = $9,
           is_default = true, updated_at = clock_timestamp()
       WHERE id = (SELECT id FROM addresses WHERE user_id = $1 AND label = $2 ORDER BY created_at LIMIT 1)
       RETURNING id`,
      values,
    )
    const { rows } = updated.rows.length
      ? updated
      : await client.query(
          `INSERT INTO addresses (user_id, label, full_name, line1, line2, city, postal_code, country, phone, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
           RETURNING id`,
          values,
        )
    await client.query("COMMIT")
    return rows[0].id
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  }
}

/** One default "Home" address per test customer and the admin: where their sample orders ship to. */
export async function seedAddresses(client) {
  const owners = [...CUSTOMERS, { email: ADMIN.email, address: ADMIN_ADDRESS }]
  for (const owner of owners) {
    const { rows } = await client.query("SELECT id, first_name, last_name FROM users WHERE lower(email) = $1", [
      owner.email.toLowerCase(),
    ])
    const user = rows[0]
    if (!user) throw new Error(`addresses need the account ${owner.email} (run the admin and customers steps first)`)
    await upsertHomeAddress(client, user.id, `${user.first_name} ${user.last_name}`, owner.address)
  }
  return `default "${SEED_ADDRESS_LABEL}" address for ${owners.length} accounts`
}
