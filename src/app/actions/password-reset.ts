"use server"

import { redirect } from "next/navigation"
import * as z from "zod"

import { passwordResetEmail } from "@/emails"
import { appUrl } from "@/emails/layout"
import { GENERIC_MESSAGE, logError } from "@/lib/errors"
import { flash } from "@/lib/flash"
import { sendMailLater } from "@/lib/mail"
import * as passwordReset from "@/lib/password-reset"
import {
  ForgotPasswordSchema,
  INVALID_RESET_TOKEN_MESSAGE,
  ResetPasswordSchema,
  type ForgotPasswordFormState,
  type ResetPasswordFormState,
} from "@/lib/validation/password-reset"

/**
 * The password reset Server Actions, for `useActionState`. Requesting a link answers the same
 * whether or not the email has an account (or was throttled); the email goes out after the
 * response. Passwords are never echoed back.
 */

const field = (formData: FormData, name: string) => {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

/** Emails a reset link to the account with this email, if there is one (field: email). */
export async function requestPasswordReset(
  _state: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const values = { email: field(formData, "email") }
  const parsed = ForgotPasswordSchema.safeParse(values)
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  try {
    const result = await passwordReset.requestPasswordReset(parsed.data.email)
    if (result.status === "created") {
      const { token, user } = result
      sendMailLater("password-reset", () => ({
        to: user.email,
        ...passwordResetEmail({
          firstName: user.firstName,
          resetUrl: appUrl(`/reset-password?token=${encodeURIComponent(token)}`),
          expiresInMinutes: passwordReset.RESET_TOKEN_TTL_MINUTES,
        }),
      }))
    }
  } catch (err) {
    logError(err, "password-reset.request")
    return { message: GENERIC_MESSAGE, values }
  }

  return { success: true, values: { email: parsed.data.email } }
}

/**
 * Sets a new password from a reset link (fields: token, password, confirmPassword). On success it
 * queues a toast and redirects to /login; an unusable token comes back as `invalidToken`.
 */
export async function resetPassword(_state: ResetPasswordFormState, formData: FormData): Promise<ResetPasswordFormState> {
  const parsed = ResetPasswordSchema.safeParse({
    token: field(formData, "token"),
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
  })
  if (!parsed.success) {
    const { token, ...errors } = z.flattenError(parsed.error).fieldErrors
    if (token) return { invalidToken: true, message: INVALID_RESET_TOKEN_MESSAGE }
    return { errors }
  }

  try {
    await passwordReset.resetPassword(parsed.data.token, parsed.data.password)
  } catch (err) {
    if (err instanceof passwordReset.InvalidResetTokenError) return { invalidToken: true, message: err.message }
    logError(err, "password-reset.reset")
    return { message: GENERIC_MESSAGE }
  }

  await flash({ type: "success", title: "Password updated", description: "Sign in with your new password." })
  redirect("/login")
}
