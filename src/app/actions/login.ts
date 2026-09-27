"use server"

import { AuthError } from "next-auth"
import * as z from "zod"

import { signIn } from "@/auth"
import { GENERIC_MESSAGE, logError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { INVALID_CREDENTIALS_MESSAGE, LoginSchema, type LoginFormState } from "@/lib/validation/login"

const log = logger.child({ scope: "login" })

export async function login(_state: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  }
  // The password is never echoed back to the client.
  const values = { email: raw.email }

  const parsed = LoginSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors
    log.info("Login rejected: invalid form", { fields: Object.keys(fieldErrors) })
    return { errors: fieldErrors, values }
  }

  try {
    // On success Auth.js sets the session cookie and throws Next's redirect, which must propagate.
    await signIn("credentials", { ...parsed.data, redirectTo: "/" })
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.type === "CredentialsSignin") return { message: INVALID_CREDENTIALS_MESSAGE, values }
      logError(err, "login")
      return { message: GENERIC_MESSAGE, values }
    }
    throw err
  }
}
