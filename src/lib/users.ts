import "server-only"

import bcrypt from "bcryptjs"

import { query } from "@/lib/db"
import { ConflictError } from "@/lib/errors"

const BCRYPT_ROUNDS = 12
const UNIQUE_VIOLATION = "23505"

export type User = {
  id: string
  first_name: string
  last_name: string
  email: string
  password_hash: string
  created_at: Date
}

export class EmailTakenError extends ConflictError {
  constructor() {
    super("Email is already registered")
  }
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export async function createUser(input: {
  firstName: string
  lastName: string
  email: string
  password: string
}) {
  const passwordHash = await hashPassword(input.password)
  try {
    const { rows } = await query<Pick<User, "id" | "email">>(
      `INSERT INTO users (first_name, last_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email`,
      [input.firstName, input.lastName, input.email.toLowerCase(), passwordHash],
    )
    return rows[0]
  } catch (err) {
    // Rely on the unique index instead of a pre-check so concurrent sign-ups can't race.
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) throw new EmailTakenError()
    throw err
  }
}

export async function findUserByEmail(email: string) {
  const { rows } = await query<User>("SELECT * FROM users WHERE lower(email) = lower($1)", [email])
  return rows[0] ?? null
}
