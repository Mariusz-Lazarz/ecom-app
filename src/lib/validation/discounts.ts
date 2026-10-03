import * as z from "zod"

import { DISCOUNT_TYPES, normalizeDiscountCode, type DiscountType } from "@/lib/order-rules"
import { MAX_PRICE_CENTS, centsToDollars, dollarsToCents } from "@/lib/validation/admin-products"

// The code field at checkout and the admin discount code form. Client-safe.

export const ADMIN_DISCOUNTS_PATH = "/admin/discounts"

export const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/
export const MAX_CODE_LENGTH = 32
export const MAX_DISCOUNT_DESCRIPTION_LENGTH = 200
export const MAX_REDEMPTION_LIMIT = 1_000_000

/** A code as a customer types it: trimmed and upper-cased. */
export const DiscountCodeEntrySchema = z
  .string({ error: "Enter a discount code." })
  .transform(normalizeDiscountCode)
  .pipe(
    z
      .string()
      .min(1, { error: "Enter a discount code." })
      .max(MAX_CODE_LENGTH, { error: "That code is too long." }),
  )

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** "2026-10-03" → that day's start in UTC, or null when it isn't a real date. */
function utcDay(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date
}

/** A stored `starts_at` as the form's start date (UTC). */
export const startsAtToDateInput = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "")

/** A stored `ends_at` (exclusive) as the form's end date, the last day the code works (UTC). */
export const endsAtToDateInput = (date: Date | null) =>
  date ? new Date(date.getTime() - DAY_MS).toISOString().slice(0, 10) : ""

const optionalText = (value: unknown) => (typeof value === "string" ? value.trim() : value)

const optionalDate = (label: string) =>
  z.preprocess(
    optionalText,
    z
      .string()
      .optional()
      .transform((value, ctx) => {
        if (!value) return null
        const date = utcDay(value)
        if (!date) {
          ctx.addIssue({ code: "custom", message: `${label} must be a date.` })
          return z.NEVER
        }
        return date
      }),
  )

const optionalLimit = (label: string) =>
  z.preprocess(
    optionalText,
    z
      .string()
      .optional()
      .transform((value, ctx) => {
        if (!value) return null
        if (!/^\d+$/.test(value) || Number(value) < 1) {
          ctx.addIssue({ code: "custom", message: `${label} must be a whole number, 1 or more, or empty.` })
          return z.NEVER
        }
        if (Number(value) > MAX_REDEMPTION_LIMIT) {
          ctx.addIssue({ code: "custom", message: `${label} must be at most ${MAX_REDEMPTION_LIMIT}.` })
          return z.NEVER
        }
        return Number(value)
      }),
  )

/**
 * The admin discount code form after parsing. `value` is typed as a whole percent for percent
 * codes and in dollars for fixed ones, and comes out as 1–100 or cents (0 for free shipping).
 * Dates are whole days in UTC: the code works from the start of `startsOn` through the end of
 * `endsOn`, so `endsAt` is the start of the following day.
 */
export const DiscountCodeFormSchema = z
  .object({
    code: z
      .string({ error: "Code is required." })
      .transform(normalizeDiscountCode)
      .pipe(
        z
          .string()
          .min(1, { error: "Code is required.", abort: true })
          .regex(CODE_PATTERN, { error: "Use 3–32 letters, digits, dashes or underscores." }),
      ),
    description: z
      .string()
      .trim()
      .max(MAX_DISCOUNT_DESCRIPTION_LENGTH, {
        error: `Description must be at most ${MAX_DISCOUNT_DESCRIPTION_LENGTH} characters.`,
      })
      .optional()
      .transform((value) => value ?? ""),
    type: z.enum(DISCOUNT_TYPES, { error: "Choose a discount type." }),
    value: z.string().optional(),
    minSubtotal: z.preprocess(
      optionalText,
      z
        .string()
        .optional()
        .transform((value, ctx) => {
          if (!value) return 0
          const cents = dollarsToCents(value)
          if (cents === null || cents > MAX_PRICE_CENTS) {
            ctx.addIssue({ code: "custom", message: "Minimum subtotal must be an amount like 30 or 29.99, or empty." })
            return z.NEVER
          }
          return cents
        }),
    ),
    startsOn: optionalDate("Start date"),
    endsOn: optionalDate("End date"),
    maxRedemptions: optionalLimit("Total uses"),
    perUserLimit: optionalLimit("Uses per customer"),
    active: z.boolean(),
  })
  .transform((data, ctx) => {
    const value = (data.value ?? "").trim()
    let parsedValue = 0
    if (data.type === "percent") {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Percent off must be a whole number from 1 to 100." })
        return z.NEVER
      }
      parsedValue = Number(value)
    } else if (data.type === "fixed") {
      const cents = dollarsToCents(value)
      if (cents === null || cents < 1 || cents > MAX_PRICE_CENTS) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Amount off must be an amount like 15 or 4.99." })
        return z.NEVER
      }
      parsedValue = cents
    }

    const startsAt = data.startsOn
    const endsAt = data.endsOn ? new Date(data.endsOn.getTime() + DAY_MS) : null
    if (startsAt && endsAt && endsAt <= startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsOn"], message: "End date must be on or after the start date." })
      return z.NEVER
    }

    return {
      code: data.code,
      description: data.description,
      type: data.type,
      value: parsedValue,
      minSubtotalCents: data.minSubtotal,
      startsAt,
      endsAt,
      maxRedemptions: data.maxRedemptions,
      perUserLimit: data.perUserLimit,
      active: data.active,
    }
  })

export type DiscountCodeInput = z.output<typeof DiscountCodeFormSchema>

export const DISCOUNT_FORM_FIELDS = [
  "code",
  "description",
  "type",
  "value",
  "minSubtotal",
  "startsOn",
  "endsOn",
  "maxRedemptions",
  "perUserLimit",
  "active",
] as const

export type DiscountFormField = (typeof DISCOUNT_FORM_FIELDS)[number]

/** What the form posts, as strings (`active` is the switch). */
export type DiscountFormValues = Partial<Record<Exclude<DiscountFormField, "active">, string>> & { active?: boolean }

export type DiscountFormState =
  | {
      errors?: Partial<Record<DiscountFormField, string[]>>
      message?: string
      values?: DiscountFormValues
    }
  | undefined

/** A stored code's value as the form shows it: "10" for 10%, "15.00" for $15 off, "" for free shipping. */
export function discountValueToInput(type: DiscountType, value: number) {
  if (type === "percent") return String(value)
  if (type === "fixed") return centsToDollars(value)
  return ""
}
