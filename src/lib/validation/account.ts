import * as z from "zod"

import { EmailSchema, PasswordSchema, personName } from "@/lib/validation/register"

/**
 * The profile form. `currentPassword` is only checked when the email changes (by
 * `updateProfile` in src/lib/users.ts, which knows the stored email).
 */
export const ProfileSchema = z.object({
  firstName: personName("First name"),
  lastName: personName("Last name"),
  email: EmailSchema,
  currentPassword: z.string().optional(),
})

export type ProfileInput = z.output<typeof ProfileSchema>
export type ProfileField = keyof ProfileInput

export type ProfileFormState =
  | {
      success?: boolean
      errors?: Partial<Record<ProfileField, string[]>>
      message?: string
      // What was typed (or saved), without the password.
      values?: Partial<Record<Exclude<ProfileField, "currentPassword">, string>>
    }
  | undefined

/** The password change form: the current password, and a new one with registration's rules. */
export const PasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Enter your current password." }),
    newPassword: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: "Passwords don't match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    error: "Choose a password different from your current one.",
    path: ["newPassword"],
  })

export type PasswordChangeInput = z.output<typeof PasswordChangeSchema>

// Passwords are never echoed back, so there are no `values`.
export type PasswordChangeFormState =
  | {
      success?: boolean
      errors?: Partial<Record<keyof PasswordChangeInput, string[]>>
      message?: string
    }
  | undefined
