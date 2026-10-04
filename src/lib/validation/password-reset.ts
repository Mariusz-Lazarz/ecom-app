import * as z from "zod"

import { EmailSchema, PasswordSchema } from "@/lib/validation/register"

/** The "forgot password" form. */
export const ForgotPasswordSchema = z.object({ email: EmailSchema })

export type ForgotPasswordFormState =
  | {
      // Set whether or not the email has an account, so the answer never tells.
      success?: boolean
      errors?: { email?: string[] }
      message?: string
      values?: { email?: string }
    }
  | undefined

export const INVALID_RESET_TOKEN_MESSAGE = "This password reset link is invalid or has expired."

/** What a reset token looks like in the link: 32 random bytes, base64url. */
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** The "choose a new password" form: the token from the link and a new password with registration's rules. */
export const ResetPasswordSchema = z
  .object({
    token: z.string().regex(RESET_TOKEN_PATTERN),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords don't match.",
    path: ["confirmPassword"],
  })

export type ResetPasswordInput = z.output<typeof ResetPasswordSchema>

// Passwords are never echoed back, so there are no `values`.
export type ResetPasswordFormState =
  | {
      errors?: Partial<Record<"password" | "confirmPassword", string[]>>
      message?: string
      // The token can't be used: the form is replaced with a link to request a new one.
      invalidToken?: boolean
    }
  | undefined
