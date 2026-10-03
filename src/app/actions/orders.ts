"use server"

import { refresh, revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import * as z from "zod"

import { auth } from "@/auth"
import * as addresses from "@/lib/addresses"
import { AppError, GENERIC_MESSAGE, logError } from "@/lib/errors"
import { flash } from "@/lib/flash"
import type { OrderStatus } from "@/lib/order-rules"
import * as orders from "@/lib/orders"
import { AddressIdSchema } from "@/lib/validation/addresses"
import {
  CheckoutSchema,
  NEW_ADDRESS,
  type CheckoutFormField,
  type CheckoutFormState,
  type CheckoutValues,
} from "@/lib/validation/checkout"
import {
  OrderNumberSchema,
  OrderStatusChangeSchema,
  type OrderStatusChangeInput,
} from "@/lib/validation/orders"

/**
 * Order Server Actions. The session is read here, never taken from the client, and roles are
 * re-checked on every call. Expected failures come back as a `message` (the domain error's text);
 * anything else is logged and reported with a generic message.
 */

const CHECKOUT_FIELDS = [
  "fullName",
  "line1",
  "line2",
  "city",
  "postalCode",
  "country",
  "phone",
  "shippingMethodId",
  "paymentMethodId",
  "addressId",
  "saveAddress",
] as const satisfies readonly CheckoutFormField[]

const ADDRESS_GONE = "That address is no longer saved. Pick another one or enter a new address."

/** What `cancelOrder` and `changeOrderStatus` resolve to. */
export type OrderActionResult = {
  ok: boolean
  // For a toast: why it failed, or what changed.
  message?: string
  errors?: Partial<Record<"status" | "note" | "trackingNumber", string[]>>
  // The order after a successful change, so the UI can update in place.
  order?: { number: string; status: OrderStatus; trackingNumber: string | null }
}

function expectedMessage(err: unknown, scope: string) {
  logError(err, scope)
  return err instanceof AppError && err.status < 500 ? err.message : GENERIC_MESSAGE
}

/**
 * Places an order from the signed-in user's cart. For `useActionState` with the checkout form
 * (fields: CHECKOUT_FIELDS). Signed-out visitors are sent to /login.
 *
 * The address is either a saved one (`addressId`, which must be the user's own; its fields replace
 * any posted address fields) or the posted fields (no `addressId`, or NEW_ADDRESS). With
 * `saveAddress=on` a new address is also saved to the account once the order is placed; failing to
 * save it doesn't undo the order, the toast just says so. The order snapshots the address either way.
 *
 * On success it queues a toast and redirects to `/orders/<number>`; otherwise it returns `errors`
 * (invalid fields) or a `message` (empty cart, stock problems…) with the typed `values`.
 */
export async function placeOrder(_state: CheckoutFormState, formData: FormData): Promise<CheckoutFormState> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect("/login")

  const values: CheckoutValues = {}
  for (const field of CHECKOUT_FIELDS) {
    const value = formData.get(field)
    if (typeof value === "string") values[field] = value
  }

  const savedId = values.addressId && values.addressId !== NEW_ADDRESS ? values.addressId : null
  let input: CheckoutValues = values
  if (savedId) {
    const id = AddressIdSchema.safeParse(savedId)
    const saved = id.success ? await addresses.getAddress(userId, id.data) : null
    if (!saved) {
      refresh()
      return { errors: { addressId: [ADDRESS_GONE] }, values, message: ADDRESS_GONE }
    }
    const { fullName, line1, line2, city, postalCode, country, phone } = saved
    input = { ...values, fullName, line1, line2: line2 ?? "", city, postalCode, country, phone }
  }

  const parsed = CheckoutSchema.safeParse(input)
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values, message: "Please check the highlighted fields." }
  }

  let number: string
  try {
    ;({ number } = await orders.placeOrder(userId, parsed.data))
  } catch (err) {
    // Stock or cart problems change what the page should show (e.g. the cart), so re-render it.
    refresh()
    return { message: expectedMessage(err, "orders.place"), values }
  }

  let description = `Thanks! Your order ${number} is confirmed.`
  if (!savedId && values.saveAddress === "on") {
    const { fullName, line1, line2, city, postalCode, country, phone } = parsed.data
    try {
      const existing = await addresses.listAddresses(userId)
      await addresses.createAddress(userId, {
        // The first saved address is "Home"; later ones are named after their city (renamable later).
        label: existing.length === 0 ? "Home" : city.slice(0, 40),
        fullName,
        line1,
        line2,
        city,
        postalCode,
        country,
        phone,
      })
      description += " The address was saved to your account."
    } catch (err) {
      description += ` We couldn't save the address: ${expectedMessage(err, "orders.saveAddress")}`
    }
  }

  await flash({ type: "success", title: "Order placed", description })
  // The cart is now empty: drop cached pages (header badge, /cart) before leaving.
  revalidatePath("/", "layout")
  redirect(`/orders/${number}`)
}

/**
 * Cancels the signed-in user's own order while it's `pending`. Extra arguments (e.g. from
 * `useActionState` or a bound form action) are ignored.
 */
export async function cancelOrder(number: string): Promise<OrderActionResult> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect("/login")

  const parsedNumber = OrderNumberSchema.safeParse(number)
  if (!parsedNumber.success) return { ok: false, message: "Order not found." }

  try {
    const result = await orders.cancelOrderAsCustomer(userId, parsedNumber.data)
    refresh()
    return {
      ok: true,
      message: `Order ${result.number} has been cancelled.`,
      order: { number: result.number, status: result.status, trackingNumber: result.trackingNumber },
    }
  } catch (err) {
    return { ok: false, message: expectedMessage(err, "orders.cancel") }
  }
}

function readStatusChange(input: OrderStatusChangeInput | FormData | undefined): Record<string, unknown> {
  if (!(input instanceof FormData)) return (input ?? {}) as Record<string, unknown>
  const field = (name: string) => {
    const value = input.get(name)
    return typeof value === "string" ? value : undefined
  }
  return { status: field("status"), note: field("note"), trackingNumber: field("trackingNumber") }
}

/**
 * Moves an order to a new status (admins only; checked here on every call). Takes
 * `(number, input)` with a plain object or FormData, or `(number, state, formData)` as
 * `useActionState(changeOrderStatus.bind(null, number), …)` calls it.
 */
export async function changeOrderStatus(
  number: string,
  input: OrderStatusChangeInput | FormData,
): Promise<OrderActionResult>
export async function changeOrderStatus(
  number: string,
  state: OrderActionResult | undefined,
  formData: FormData,
): Promise<OrderActionResult>
export async function changeOrderStatus(
  number: string,
  first: OrderStatusChangeInput | FormData | OrderActionResult | undefined,
  formData?: FormData,
): Promise<OrderActionResult> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect("/login")
  if (session.user.role !== "admin") {
    logError(new AppError("Status change by a non-admin", 403, "forbidden"), "orders.status")
    return { ok: false, message: "You don't have access to this action." }
  }

  const parsedNumber = OrderNumberSchema.safeParse(number)
  if (!parsedNumber.success) return { ok: false, message: "Order not found." }

  const parsed = OrderStatusChangeSchema.safeParse(
    readStatusChange(formData ?? (first as OrderStatusChangeInput | FormData | undefined)),
  )
  if (!parsed.success) {
    return { ok: false, message: "Please check the status change.", errors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const result = await orders.changeOrderStatus(parsedNumber.data, parsed.data, { userId, role: "admin" })
    refresh()
    return {
      ok: true,
      message: `Order ${result.number} is now ${result.status}.`,
      order: { number: result.number, status: result.status, trackingNumber: result.trackingNumber },
    }
  } catch (err) {
    return { ok: false, message: expectedMessage(err, "orders.status") }
  }
}
