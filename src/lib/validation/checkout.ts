import * as z from "zod"

import { findPaymentMethod, findShippingMethod } from "@/lib/order-rules"

/** Countries we ship to, for the checkout's country select. Codes are ISO 3166-1 alpha-2. */
export const SUPPORTED_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "PL", name: "Poland" },
] as const

export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number]["code"]

const COUNTRY_CODES = SUPPORTED_COUNTRIES.map((country) => country.code) as [CountryCode, ...CountryCode[]]

const text = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(min, { error: min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.` })
    .max(max, { error: `${label} must be at most ${max} characters.` })

export const ShippingAddressSchema = z.object({
  fullName: text("Full name", 2, 100),
  line1: text("Address", 3, 120),
  // Optional: an empty field counts as not given.
  line2: z
    .string()
    .trim()
    .max(120, { error: "Address line 2 must be at most 120 characters." })
    .optional()
    .transform((value) => (value ? value : null)),
  city: text("City", 1, 80),
  // Formats differ per country, so only the characters and length are checked.
  postalCode: text("Postal code", 2, 16)
    .regex(/^[A-Za-z0-9][A-Za-z0-9 -]*$/, { error: "Please enter a valid postal code." })
    .transform((value) => value.toUpperCase()),
  country: z
    .string({ error: "Country is required." })
    .trim()
    .toUpperCase()
    .pipe(z.enum(COUNTRY_CODES, { error: "We don't ship to this country." })),
  // Digits with the usual separators and an optional leading +, at least 6 digits.
  phone: text("Phone", 6, 25).refine(
    (value) => /^\+?[0-9 ().-]+$/.test(value) && value.replace(/\D/g, "").length >= 6,
    { error: "Please enter a valid phone number." },
  ),
})

export const CheckoutSchema = ShippingAddressSchema.extend({
  shippingMethodId: z
    .string({ error: "Choose a shipping method." })
    .refine((id) => findShippingMethod(id) !== undefined, { error: "Choose a shipping method." }),
  paymentMethodId: z
    .string({ error: "Choose a payment method." })
    .refine((id) => findPaymentMethod(id) !== undefined, { error: "Choose a payment method." }),
})

export type ShippingAddress = z.output<typeof ShippingAddressSchema>
export type CheckoutInput = z.output<typeof CheckoutSchema>
export type CheckoutField = keyof CheckoutInput

/** The checkout form's fields as typed, echoed back so a failed submit keeps them. */
export type CheckoutValues = Partial<Record<CheckoutField, string>>

export type CheckoutFormState =
  | {
      errors?: Partial<Record<CheckoutField, string[]>>
      message?: string
      values?: CheckoutValues
    }
  | undefined
