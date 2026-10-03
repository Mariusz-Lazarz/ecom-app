import bcrypt from "bcryptjs"

// Same cost as src/lib/users.ts, so seeded hashes verify like registered ones.
const BCRYPT_ROUNDS = 12

export const ADMIN = { email: "iluu0456@gmail.com", firstName: "Mariusz", lastName: "Admin" }

/**
 * Creates the account as an admin, or promotes an existing account with that email (any case)
 * and resets its password. Returns the row's id, email and role.
 */
export async function upsertAdmin(client, { email, firstName, lastName, password }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const { rows } = await client.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'admin')
     ON CONFLICT (lower(email)) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = 'admin'
     RETURNING id, email, role`,
    [firstName, lastName, email.toLowerCase(), passwordHash],
  )
  return rows[0]
}

export async function seedAdmin(client) {
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!password) {
    throw new Error("SEED_ADMIN_PASSWORD is not set. Add it to .env.local to seed the admin account.")
  }
  const admin = await upsertAdmin(client, { ...ADMIN, password })
  return `admin ${admin.email}`
}
