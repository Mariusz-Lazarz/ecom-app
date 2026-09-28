"use server"

import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import * as z from "zod"

import { signIn } from "@/auth"
import { GENERIC_MESSAGE, logError } from "@/lib/errors"
import { flash } from "@/lib/flash"
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
    // Auth.js sets the session cookie and resolves; failed sign-ins throw an AuthError.
    await signIn("credentials", { ...parsed.data, redirect: false })
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.type === "CredentialsSignin") return { message: INVALID_CREDENTIALS_MESSAGE, values }
      logError(err, "login")
      return { message: GENERIC_MESSAGE, values }
    }
    throw err
  }

  await flash({ type: "success", title: "Welcome back!", description: "You're signed in." })
  redirect("/")
}
