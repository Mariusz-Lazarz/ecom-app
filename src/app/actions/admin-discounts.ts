"use server"

import { refresh, revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import * as z from "zod"

import { auth } from "@/auth"
import * as discounts from "@/lib/discounts"
import { AppError, ForbiddenError, GENERIC_MESSAGE, logError } from "@/lib/errors"
import { flash } from "@/lib/flash"
import { loginHref } from "@/lib/safe-redirect"
import {
  ADMIN_DISCOUNTS_PATH,
  DISCOUNT_FORM_FIELDS,
  DiscountCodeFormSchema,
  type DiscountFormField,
  type DiscountFormState,
  type DiscountFormValues,
} from "@/lib/validation/discounts"

/**
 * Admin discount code Server Actions. Every call reads the session itself and re-checks the admin
 * role: signed-out callers are sent to /login, other users get a "no access" result. Expected
 * failures come back as field `errors` or a `message`; anything else is logged and reported
 * generically.
 */

const NO_ACCESS = "You don't have access to this action."
const GONE = "This discount code no longer exists."
const codeId = z.uuid()

async function requireAdminAction(scope: string): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) redirect(loginHref(ADMIN_DISCOUNTS_PATH))
  if (session.user.role !== "admin") {
    logError(new ForbiddenError("Discount code change by a non-admin"), scope)
    return null
  }
  return session.user.id
}

function expectedMessage(err: unknown, scope: string) {
  logError(err, scope)
  return err instanceof AppError && err.status < 500 ? err.message : GENERIC_MESSAGE
}

function readValues(formData: FormData): DiscountFormValues {
  const values: DiscountFormValues = {}
  for (const field of DISCOUNT_FORM_FIELDS) {
    if (field === "active") continue
    const value = formData.get(field)
    if (typeof value === "string") values[field] = value
  }
  // A switch posts its value only when on.
  values.active = formData.has("active")
  return values
}

/**
 * Creates (`id` null) or updates a discount code from the discount form. For
 * `useActionState(saveDiscountCode.bind(null, id), …)`. On success it queues a toast and redirects
 * to the list; otherwise it returns field `errors` or a `message` with the posted `values`.
 */
export async function saveDiscountCode(
  id: string | null,
  _state: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const scope = id ? "admin-discounts.update" : "admin-discounts.create"
  if (!(await requireAdminAction(scope))) return { message: NO_ACCESS }
  if (id !== null && !codeId.safeParse(id).success) return { message: GONE }

  const values = readValues(formData)
  const parsed = DiscountCodeFormSchema.safeParse(values)
  if (!parsed.success) {
    return {
      errors: z.flattenError(parsed.error).fieldErrors as Partial<Record<DiscountFormField, string[]>>,
      values,
      message: "Please check the highlighted fields.",
    }
  }

  let saved: { code: string }
  try {
    saved = id ? await discounts.updateDiscountCode(id, parsed.data) : await discounts.createDiscountCode(parsed.data)
  } catch (err) {
    if (err instanceof discounts.CodeTakenError) {
      logError(err, scope)
      return { errors: { code: [err.message] }, values, message: "Please check the highlighted fields." }
    }
    return { message: expectedMessage(err, scope), values }
  }

  await flash({ type: "success", title: id ? "Discount code saved" : "Discount code created", description: saved.code })
  revalidatePath(ADMIN_DISCOUNTS_PATH)
  redirect(ADMIN_DISCOUNTS_PATH)
}

export type DiscountActionResult = { ok: boolean; message?: string; active?: boolean }

/** Activates or deactivates a code (admins only); the list re-renders in place. */
export async function setDiscountCodeActive(id: string, active: boolean): Promise<DiscountActionResult> {
  const scope = "admin-discounts.toggle"
  if (!(await requireAdminAction(scope))) return { ok: false, message: NO_ACCESS }
  if (!codeId.safeParse(id).success || typeof active !== "boolean") return { ok: false, message: GONE }

  try {
    const result = await discounts.setDiscountCodeActive(id, active)
    refresh()
    return { ok: true, active: result.active, message: `${result.code} is now ${result.active ? "active" : "inactive"}.` }
  } catch (err) {
    return { ok: false, message: expectedMessage(err, scope) }
  }
}

/**
 * Deletes a code that was never redeemed (admins only). On success it queues a toast and
 * redirects to the list; a redeemed code comes back as a `message` saying to deactivate it.
 */
export async function deleteDiscountCode(id: string): Promise<DiscountActionResult> {
  const scope = "admin-discounts.delete"
  if (!(await requireAdminAction(scope))) return { ok: false, message: NO_ACCESS }
  if (!codeId.safeParse(id).success) return { ok: false, message: GONE }

  let deleted: { code: string }
  try {
    deleted = await discounts.deleteDiscountCode(id)
  } catch (err) {
    return { ok: false, message: expectedMessage(err, scope) }
  }

  await flash({ type: "success", title: "Discount code deleted", description: deleted.code })
  revalidatePath(ADMIN_DISCOUNTS_PATH)
  redirect(ADMIN_DISCOUNTS_PATH)
}
