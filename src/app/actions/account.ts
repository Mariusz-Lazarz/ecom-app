"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import * as z from "zod"

import { auth, updateSession } from "@/auth"
import { GENERIC_MESSAGE, logError } from "@/lib/errors"
import { flash } from "@/lib/flash"
import { logger } from "@/lib/logger"
import * as users from "@/lib/users"
import {
  PasswordChangeSchema,
  ProfileSchema,
  type PasswordChangeFormState,
  type ProfileFormState,
} from "@/lib/validation/account"

/**
 * Account settings Server Actions for `useActionState`. The user is always the session's (never
 * taken from the form); signed-out visitors are sent to /login. Passwords are never echoed back.
 */

const log = logger.child({ scope: "account" })

async function sessionUserId() {
  const userId = (await auth())?.user?.id
  if (!userId) redirect("/login")
  return userId
}

const field = (formData: FormData, name: string) => {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

/**
 * Saves the name and email (fields: firstName, lastName, email, currentPassword — the last only
 * needed when the email changes). On success the session's name and email are updated in place,
 * a toast is queued and the page re-renders.
 */
export async function updateProfile(_state: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const userId = await sessionUserId()
  const values = {
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    email: field(formData, "email"),
  }

  const parsed = ProfileSchema.safeParse({ ...values, currentPassword: field(formData, "currentPassword") })
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  let saved: Awaited<ReturnType<typeof users.updateProfile>>
  try {
    saved = await users.updateProfile(userId, parsed.data)
  } catch (err) {
    if (err instanceof users.EmailTakenError) {
      return { errors: { email: ["An account with this email already exists."] }, values }
    }
    if (err instanceof users.IncorrectPasswordError) {
      log.info("Profile change rejected: wrong password", { userId })
      return { errors: { currentPassword: [err.message] }, values }
    }
    logError(err, "account.profile")
    return { message: GENERIC_MESSAGE, values }
  }

  log.info("Profile updated", { userId })
  // The JWT still carries the old name and email until it's re-issued.
  await updateSession({ user: { name: `${saved.firstName} ${saved.lastName}`, email: saved.email } })
  await flash({ type: "success", title: "Profile updated" })
  refresh()
  return { success: true, values: saved }
}

/**
 * Changes the password (fields: currentPassword, newPassword, confirmPassword). The session stays
 * as it is, so the user remains signed in.
 */
export async function changePassword(
  _state: PasswordChangeFormState,
  formData: FormData,
): Promise<PasswordChangeFormState> {
  const userId = await sessionUserId()
  const parsed = PasswordChangeSchema.safeParse({
    currentPassword: field(formData, "currentPassword"),
    newPassword: field(formData, "newPassword"),
    confirmPassword: field(formData, "confirmPassword"),
  })
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors }

  try {
    await users.changePassword(userId, parsed.data.currentPassword, parsed.data.newPassword)
  } catch (err) {
    if (err instanceof users.IncorrectPasswordError) {
      log.info("Password change rejected: wrong password", { userId })
      return { errors: { currentPassword: [err.message] } }
    }
    logError(err, "account.password")
    return { message: GENERIC_MESSAGE }
  }

  log.info("Password changed", { userId })
  await flash({ type: "success", title: "Password changed", description: "Use your new password next time you sign in." })
  return { success: true }
}
