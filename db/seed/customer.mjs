import bcrypt from "bcryptjs"

// Same cost as src/lib/users.ts, so seeded hashes verify like registered ones.
const BCRYPT_ROUNDS = 12

export const CUSTOMER = { email: "customer@northcart.test", firstName: "Test", lastName: "Customer" }

/**
 * Creates the test customer as a plain `user`, or resets an existing account with that email (any
 * case) to that name, role and password. Returns the row's id, email and role.
 */
export async function upsertCustomer(client, { email, firstName, lastName, password }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const { rows } = await client.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'user')
     ON CONFLICT (lower(email)) DO UPDATE
       SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
           password_hash = EXCLUDED.password_hash, role = 'user'
     RETURNING id, email, role`,
    [firstName, lastName, email.toLowerCase(), passwordHash],
  )
  return rows[0]
}

export async function seedCustomer(client) {
  const password = process.env.SEED_CUSTOMER_PASSWORD
  if (!password) {
    throw new Error("SEED_CUSTOMER_PASSWORD is not set. Add it to .env.local to seed the test customer account.")
  }
  const customer = await upsertCustomer(client, { ...CUSTOMER, password })
  return `customer ${customer.email}`
}
