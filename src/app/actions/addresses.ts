"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import * as z from "zod"

import { auth } from "@/auth"
import * as addresses from "@/lib/addresses"
import { AppError, GENERIC_MESSAGE, logError } from "@/lib/errors"
import {
  AddressIdSchema,
  SavedAddressSchema,
  type AddressField,
  type AddressFormState,
  type AddressValues,
} from "@/lib/validation/addresses"

/**
 * Saved address Server Actions. The owner is always the session's user (signed-out visitors are
 * sent to /login), so an id from another account is simply "not found". Expected failures (limit,
 * not found) come back as a `message`; anything else is logged and reported generically.
 * Successful writes `refresh()` the page.
 */

export type AddressActionResult = { ok: boolean; message?: string }

const ADDRESS_FIELDS = [
  "label",
  "fullName",
  "line1",
  "line2",
  "city",
  "postalCode",
  "country",
  "phone",
] as const satisfies readonly AddressField[]

async function sessionUserId() {
  const userId = (await auth())?.user?.id
  if (!userId) redirect("/login")
  return userId
}

function expectedMessage(err: unknown, scope: string) {
  logError(err, scope)
  return err instanceof AppError && err.status < 500 ? err.message : GENERIC_MESSAGE
}

/**
 * Adds an address, or edits one when the form carries its `id`. For `useActionState` with the
 * address form (fields: ADDRESS_FIELDS). Returns `success`, or `errors` / a `message` with the
 * typed `values`.
 */
export async function saveAddress(_state: AddressFormState, formData: FormData): Promise<AddressFormState> {
  const userId = await sessionUserId()
  const values: AddressValues = {}
  for (const name of ADDRESS_FIELDS) {
    const value = formData.get(name)
    if (typeof value === "string") values[name] = value
  }
  const rawId = formData.get("id")

  const parsed = SavedAddressSchema.safeParse(values)
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values, message: "Please check the highlighted fields." }
  }

  try {
    if (typeof rawId === "string" && rawId !== "") {
      const id = AddressIdSchema.safeParse(rawId)
      if (!id.success) return { message: "Address not found.", values }
      await addresses.updateAddress(userId, id.data, parsed.data)
    } else {
      await addresses.createAddress(userId, parsed.data)
    }
  } catch (err) {
    return { message: expectedMessage(err, "addresses.save"), values }
  }

  refresh()
  return { success: true }
}

async function run(scope: string, id: unknown, mutate: (userId: string, id: string) => Promise<void>) {
  const userId = await sessionUserId()
  const parsedId = AddressIdSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, message: "Address not found." }
  try {
    await mutate(userId, parsedId.data)
  } catch (err) {
    return { ok: false, message: expectedMessage(err, scope) }
  }
  refresh()
  return { ok: true }
}

/** Deletes one of the user's addresses (the oldest remaining one becomes the default if needed). */
export async function deleteAddress(id: string): Promise<AddressActionResult> {
  return run("addresses.delete", id, addresses.deleteAddress)
}

/** Makes one of the user's addresses the default for checkout. */
export async function setDefaultAddress(id: string): Promise<AddressActionResult> {
  return run("addresses.setDefault", id, addresses.setDefaultAddress)
}
