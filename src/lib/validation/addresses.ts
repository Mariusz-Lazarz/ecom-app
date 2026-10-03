import * as z from "zod"

import { ShippingAddressSchema } from "@/lib/validation/checkout"

/** How many addresses one account can save. */
export const MAX_ADDRESSES = 10

/** A saved address: the checkout's shipping address with a label. */
export const SavedAddressSchema = ShippingAddressSchema.extend({
  label: z
    .string({ error: "Label is required." })
    .trim()
    .min(1, { error: "Label is required." })
    .max(40, { error: "Label must be at most 40 characters." }),
})

export type SavedAddressInput = z.output<typeof SavedAddressSchema>
export type AddressField = keyof SavedAddressInput

/** The address form's fields as typed, echoed back so a failed submit keeps them. */
export type AddressValues = Partial<Record<AddressField, string>>

export type AddressFormState =
  | {
      success?: boolean
      errors?: Partial<Record<AddressField, string[]>>
      message?: string
      values?: AddressValues
    }
  | undefined

export const AddressIdSchema = z.uuid({ error: "Address not found." })
