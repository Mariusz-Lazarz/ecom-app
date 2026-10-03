"use client"

import { useId } from "react"

import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SUPPORTED_COUNTRIES, type ShippingAddress } from "@/lib/validation/checkout"

export type AddressFieldName = keyof ShippingAddress

type AddressFieldsProps = {
  // Prefixes the inputs' ids (e.g. "checkout" → "checkout-city"), so forms can't clash.
  idPrefix: string
  values: Partial<Record<AddressFieldName, string>>
  errors?: Partial<Record<AddressFieldName, string[]>>
}

const COUNTRY_ITEMS = SUPPORTED_COUNTRIES.map((country) => ({ value: country.code, label: country.name }))

/**
 * The shipping address inputs (name, address lines, city, postal code, country, phone), shared by
 * the checkout and the saved address form. Fields are uncontrolled: `values` are their initial
 * values, and `errors` show under each field. Lays out as a two-column grid from `sm` up; put it
 * inside a FieldGroup or another grid container.
 */
export function AddressFields({ idPrefix, values, errors }: AddressFieldsProps) {
  const countryLabelId = useId()
  const country = SUPPORTED_COUNTRIES.some((c) => c.code === values.country) ? values.country : "US"
  const common = { idPrefix, values, errors }

  return (
    <>
      <TextField {...common} name="fullName" label="Full name" autoComplete="name" className="sm:col-span-2" />
      <TextField {...common} name="line1" label="Address" autoComplete="address-line1" className="sm:col-span-2" />
      <TextField
        {...common}
        name="line2"
        label="Apartment, suite, etc. (optional)"
        autoComplete="address-line2"
        required={false}
        className="sm:col-span-2"
      />
      <TextField {...common} name="city" label="City" autoComplete="address-level2" />
      <TextField {...common} name="postalCode" label="Postal code" autoComplete="postal-code" />
      <Field data-invalid={errors?.country ? true : undefined}>
        <FieldLabel id={countryLabelId}>Country</FieldLabel>
        <Select name="country" items={COUNTRY_ITEMS} defaultValue={country}>
          <SelectTrigger
            aria-labelledby={countryLabelId}
            aria-invalid={errors?.country ? true : undefined}
            className="h-10 w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTRY_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError>{errors?.country?.[0]}</FieldError>
      </Field>
      <TextField {...common} name="phone" label="Phone" type="tel" autoComplete="tel" />
    </>
  )
}

type TextFieldProps = AddressFieldsProps & {
  name: AddressFieldName
  label: string
  type?: string
  autoComplete?: string
  required?: boolean
  className?: string
}

function TextField({
  idPrefix,
  name,
  label,
  values,
  errors,
  type = "text",
  autoComplete,
  required = true,
  className,
}: TextFieldProps) {
  const error = errors?.[name]?.[0]
  const id = `${idPrefix}-${name}`
  const errorId = `${id}-error`
  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={values[name] ?? ""}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-10"
      />
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  )
}
