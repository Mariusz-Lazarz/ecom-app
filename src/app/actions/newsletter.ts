"use server"

import * as z from "zod"

import { GENERIC_MESSAGE, logError } from "@/lib/errors"
import { sendMailLater } from "@/lib/mail"
import * as newsletter from "@/lib/newsletter"
import {
  INVALID_UNSUBSCRIBE_LINK_MESSAGE,
  NewsletterSchema,
  UnsubscribeTokenSchema,
  type NewsletterFormState,
} from "@/lib/validation/newsletter"

/**
 * Newsletter Server Actions, for `useActionState`. Subscribing answers the same whether the address
 * is new, already subscribed, unsubscribed before or throttled, so the form can't tell anyone which
 * addresses are on the list; the confirmation email goes out after the response.
 */

const field = (formData: FormData, name: string) => {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

/** Subscribes the address from the home page form (field: email). */
export async function subscribeToNewsletter(_state: NewsletterFormState, formData: FormData): Promise<NewsletterFormState> {
  const values = { email: field(formData, "email") }
  const parsed = NewsletterSchema.safeParse(values)
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  try {
    const result = await newsletter.subscribe(parsed.data.email, "home")
    if (result.status === "subscribed") {
      const { email, token } = result
      sendMailLater("newsletter", () => newsletter.newsletterConfirmationMessage(email, token))
    }
  } catch (err) {
    logError(err, "newsletter.subscribe")
    return { message: GENERIC_MESSAGE, values }
  }
  return { success: true, email: parsed.data.email }
}

export type UnsubscribeState =
  | { status: "unsubscribed"; email: string }
  | { status: "invalid" | "error"; message: string }
  | undefined

/** Unsubscribes the address an emailed link's token belongs to (field: token). */
export async function unsubscribeFromNewsletter(_state: UnsubscribeState, formData: FormData): Promise<UnsubscribeState> {
  const token = UnsubscribeTokenSchema.safeParse(field(formData, "token"))
  if (!token.success) return { status: "invalid", message: INVALID_UNSUBSCRIBE_LINK_MESSAGE }
  try {
    const result = await newsletter.unsubscribe(token.data)
    if (result.status === "invalid") return { status: "invalid", message: INVALID_UNSUBSCRIBE_LINK_MESSAGE }
    return { status: "unsubscribed", email: result.email }
  } catch (err) {
    logError(err, "newsletter.unsubscribe")
    return { status: "error", message: GENERIC_MESSAGE }
  }
}
