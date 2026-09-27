"use server"

import * as z from "zod"

import { createUser, EmailTakenError } from "@/lib/users"
import { RegisterSchema, type RegisterFormState } from "@/lib/validation/register"

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
    return { errors: z.flattenError(parsed.error).fieldErrors, values }
  }

  try {
    await createUser(parsed.data)
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return { errors: { email: ["An account with this email already exists."] }, values }
    }
    console.error("Registration failed", err)
    return { message: "Something went wrong. Please try again.", values }
  }

  return { success: true, firstName: parsed.data.firstName }
}
