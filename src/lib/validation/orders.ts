import * as z from "zod"

import { ORDER_STATUSES } from "@/lib/order-rules"

export const MAX_NOTE_LENGTH = 500
export const MAX_TRACKING_NUMBER_LENGTH = 64
export const DEFAULT_ORDERS_PAGE_SIZE = 20
export const MAX_ORDERS_PAGE_SIZE = 100
export const MAX_ORDERS_PAGE = 1000

/** An order number as shown to people (`NC-10001`); case and surrounding spaces are forgiven. */
export const OrderNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^NC-\d{1,12}$/, { error: "Not a valid order number." })

// Empty optional fields (a blank form input) count as not given.
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} must be at most ${max} characters.` })
    .optional()
    .transform((value) => (value ? value : undefined))

/** An admin's status change. A tracking number only goes with `shipped`. */
export const OrderStatusChangeSchema = z
  .object({
    status: z.enum(ORDER_STATUSES, { error: "Choose a valid status." }),
    note: optionalText(MAX_NOTE_LENGTH, "Note"),
    trackingNumber: optionalText(MAX_TRACKING_NUMBER_LENGTH, "Tracking number").pipe(
      z
        .string()
        .regex(/^[A-Za-z0-9-]+$/, { error: "Tracking numbers use letters, digits and dashes only." })
        .optional(),
    ),
  })
  .refine((data) => data.trackingNumber === undefined || data.status === "shipped", {
    error: "A tracking number can only be set when the order ships.",
    path: ["trackingNumber"],
  })

export type OrderStatusChangeInput = z.input<typeof OrderStatusChangeSchema>
export type OrderStatusChange = z.output<typeof OrderStatusChangeSchema>

// Query strings arrive as strings, or arrays when a key repeats; empty ones count as not set.
const param = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => {
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first !== "string") return first
    const trimmed = first.trim()
    return trimmed === "" ? undefined : trimmed
  }, schema)

/** The admin order list's filters as they come from a URL (`searchParams`). */
export const OrderListQuerySchema = z.object({
  status: param(z.enum(ORDER_STATUSES).optional()),
  // Matches an order number or a customer's email.
  q: param(z.string().max(100).optional()),
  page: param(z.coerce.number().int().min(1).max(MAX_ORDERS_PAGE).default(1)),
  pageSize: param(z.coerce.number().int().min(1).max(MAX_ORDERS_PAGE_SIZE).default(DEFAULT_ORDERS_PAGE_SIZE)),
})

export type OrderListQuery = z.output<typeof OrderListQuerySchema>
