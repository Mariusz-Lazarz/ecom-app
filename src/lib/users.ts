import "server-only"

import bcrypt from "bcryptjs"

import { query } from "@/lib/db"
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors"
import type { Role } from "@/lib/roles"

const BCRYPT_ROUNDS = 12
const UNIQUE_VIOLATION = "23505"

export type User = {
  id: string
  first_name: string
  last_name: string
  email: string
  password_hash: string
  role: Role
  created_at: Date
}

export class EmailTakenError extends ConflictError {
  constructor() {
    super("Email is already registered")
  }
}

/** The current password given to confirm a sensitive change doesn't match the stored hash. */
export class IncorrectPasswordError extends BadRequestError {
  constructor() {
    super("Your current password is incorrect.")
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

export async function findUserById(id: string) {
  const { rows } = await query<User>("SELECT * FROM users WHERE id = $1", [id])
  return rows[0] ?? null
}

async function requireUserById(id: string) {
  const user = await findUserById(id)
  if (!user) throw new NotFoundError("Account not found.")
  return user
}

/**
 * Changes the user's name and email. Changing the email (compared case-insensitively) needs the
 * current password; a name-only change doesn't. Returns the saved name and email.
 *
 * @throws IncorrectPasswordError when the email changes and `currentPassword` is missing or wrong.
 * @throws EmailTakenError when another account already uses the email (any case).
 * @throws NotFoundError when the account no longer exists.
 */
export async function updateProfile(
  userId: string,
  input: { firstName: string; lastName: string; email: string; currentPassword?: string },
) {
  const user = await requireUserById(userId)
  const email = input.email.toLowerCase()
  if (email !== user.email.toLowerCase()) {
    if (!input.currentPassword || !(await verifyPassword(input.currentPassword, user.password_hash))) {
      throw new IncorrectPasswordError()
    }
  }
  try {
    const { rows } = await query<Pick<User, "first_name" | "last_name" | "email">>(
      `UPDATE users SET first_name = $2, last_name = $3, email = $4
       WHERE id = $1
       RETURNING first_name, last_name, email`,
      [userId, input.firstName, input.lastName, email],
    )
    if (!rows[0]) throw new NotFoundError("Account not found.")
    return { firstName: rows[0].first_name, lastName: rows[0].last_name, email: rows[0].email }
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) throw new EmailTakenError()
    throw err
  }
}

/**
 * Replaces the user's password after checking the current one.
 *
 * @throws IncorrectPasswordError when `currentPassword` doesn't match.
 * @throws NotFoundError when the account no longer exists.
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await requireUserById(userId)
  if (!(await verifyPassword(currentPassword, user.password_hash))) throw new IncorrectPasswordError()
  const passwordHash = await hashPassword(newPassword)
  await query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, passwordHash])
}
