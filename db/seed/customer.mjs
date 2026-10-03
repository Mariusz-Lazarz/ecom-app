import bcrypt from "bcryptjs"

// Same cost as src/lib/users.ts, so seeded hashes verify like registered ones.
const BCRYPT_ROUNDS = 12

/**
 * The test customers. Each one's password comes from its `passwordEnv` variable in .env.local, and
 * `address` is what their sample orders ship to (see orders.mjs).
 */
export const CUSTOMERS = [
  {
    key: "anna",
    email: "anna@northcart.test",
    firstName: "Anna",
    lastName: "Kowalska",
    passwordEnv: "SEED_CUSTOMER_ANNA_PASSWORD",
    address: {
      line1: "ul. Marszałkowska 84",
      line2: "m. 12",
      city: "Warszawa",
      postalCode: "00-514",
      country: "PL",
      phone: "+48 512 345 678",
    },
  },
  {
    key: "ben",
    email: "ben@northcart.test",
    firstName: "Ben",
    lastName: "Carter",
    passwordEnv: "SEED_CUSTOMER_BEN_PASSWORD",
    address: {
      line1: "123 Market Street",
      line2: "Apt 4B",
      city: "San Francisco",
      postalCode: "94103",
      country: "US",
      phone: "+1 415 555 0134",
    },
  },
  {
    key: "chloe",
    email: "chloe@northcart.test",
    firstName: "Chloe",
    lastName: "Martin",
    passwordEnv: "SEED_CUSTOMER_CHLOE_PASSWORD",
    address: {
      line1: "42 Camden High Street",
      line2: null,
      city: "London",
      postalCode: "NW1 0JH",
      country: "GB",
      phone: "+44 20 7946 0321",
    },
  },
]

/**
 * Creates a test customer as a plain `user`, or resets an existing account with that email (any
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

export async function seedCustomers(client) {
  const missing = CUSTOMERS.filter((customer) => !process.env[customer.passwordEnv]).map((c) => c.passwordEnv)
  if (missing.length) {
    throw new Error(`${missing.join(", ")} not set. Add them to .env.local to seed the test customers.`)
  }
  const emails = []
  for (const customer of CUSTOMERS) {
    const row = await upsertCustomer(client, { ...customer, password: process.env[customer.passwordEnv] })
    emails.push(row.email)
  }
  return `customers ${emails.join(", ")}`
}
