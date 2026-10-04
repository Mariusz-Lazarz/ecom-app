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

// A calendar day that exists (2026-02-30 doesn't).
const isRealDay = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

const day = (label: string) =>
  param(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { error: `${label} must be a date like 2026-01-31.` })
      .refine(isRealDay, { error: `${label} isn't a real date.` })
      .optional(),
  )

/**
 * The orders CSV export's filters (`/api/admin/orders/export`): the list's status and search, plus
 * `from` / `to` UTC days (`YYYY-MM-DD`, both inclusive).
 */
export const OrderExportQuerySchema = z
  .object({
    status: param(z.enum(ORDER_STATUSES, { error: "Choose a valid status." }).optional()),
    q: param(z.string().max(100, { error: "Search must be at most 100 characters." }).optional()),
    from: day("From"),
    to: day("To"),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    error: "From must not be after To.",
    path: ["to"],
  })

export type OrderExportQuery = z.output<typeof OrderExportQuerySchema>
