"use server"

import * as z from "zod"

import { GENERIC_MESSAGE, logError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { createUser, EmailTakenError } from "@/lib/users"
import { RegisterSchema, type RegisterFormState } from "@/lib/validation/register"

const log = logger.child({ scope: "register" })

export async function register(_state: RegisterFormState, formData: FormData): Promise<RegisterFormState> {
  const raw = {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  }
  // Passwords are never echoed back to the client.
  const values = { firstName: raw.firstName, lastName: raw.lastName, email: raw.email }

  const parsed = RegisterSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors
    log.info("Registration rejected: invalid form", { fields: Object.keys(fieldErrors) })
    return { errors: fieldErrors, values }
  }

  try {
    const user = await createUser(parsed.data)
    log.info("User registered", { userId: user?.id })
  } catch (err) {
    if (err instanceof EmailTakenError) {
      log.info("Registration rejected: email taken", { email: parsed.data.email })
      return { errors: { email: ["An account with this email already exists."] }, values }
    }
    logError(err, "register")
    return { message: GENERIC_MESSAGE, values }
  }

  return { success: true, firstName: parsed.data.firstName }
}
