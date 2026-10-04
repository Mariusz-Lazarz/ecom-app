"use server"

import * as z from "zod"

import { welcomeEmail } from "@/emails"
import { GENERIC_MESSAGE, logError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { sendMailLater } from "@/lib/mail"
import * as newsletter from "@/lib/newsletter"
import { createUser, EmailTakenError } from "@/lib/users"
import { RegisterSchema, type RegisterFormState } from "@/lib/validation/register"

const log = logger.child({ scope: "register" })

/**
 * Creates the account and, after the response, emails a welcome. With the `newsletter` checkbox on,
 * it also subscribes the email (a failure there is logged and doesn't fail the registration).
 * Passwords are never echoed back.
 */
export async function register(_state: RegisterFormState, formData: FormData): Promise<RegisterFormState> {
  const raw = {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  }
  const wantsNewsletter = formData.get("newsletter") === "on"
  // Passwords are never echoed back to the client.
  const values = { firstName: raw.firstName, lastName: raw.lastName, email: raw.email, newsletter: wantsNewsletter }

  const parsed = RegisterSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors
    log.info("Registration rejected: invalid form", { fields: Object.keys(fieldErrors) })
    return { errors: fieldErrors, values }
  }

  try {
    const user = await createUser(parsed.data)
    log.info("User registered", { userId: user?.id })
    const { email, firstName } = parsed.data
    sendMailLater("welcome", () => ({ to: email, ...welcomeEmail({ firstName }) }))
    if (wantsNewsletter) await subscribeToNewsletter(email)
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

async function subscribeToNewsletter(email: string) {
  try {
    const result = await newsletter.subscribe(email, "register")
    if (result.status === "subscribed") {
      sendMailLater("newsletter", () => newsletter.newsletterConfirmationMessage(result.email, result.token))
    }
  } catch (err) {
    logError(err, "register.newsletter")
  }
}
