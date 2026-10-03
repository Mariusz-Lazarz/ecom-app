"use client"

import Link from "next/link"
import { useActionState, useState, useTransition, type FormEvent } from "react"
import { CircleAlert } from "lucide-react"

import { saveDiscountCode } from "@/app/actions/admin-discounts"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import type { DiscountCode } from "@/lib/discounts"
import { DISCOUNT_TYPE_LABELS, DISCOUNT_TYPES, type DiscountType } from "@/lib/order-rules"
import { centsToDollars } from "@/lib/validation/admin-products"
import {
  ADMIN_DISCOUNTS_PATH,
  MAX_CODE_LENGTH,
  MAX_DISCOUNT_DESCRIPTION_LENGTH,
  discountValueToInput,
  endsAtToDateInput,
  startsAtToDateInput,
  type DiscountFormField,
  type DiscountFormState,
} from "@/lib/validation/discounts"

export type EditableDiscountCode = Pick<
  DiscountCode,
  | "id"
  | "code"
  | "description"
  | "type"
  | "value"
  | "minSubtotalCents"
  | "startsAt"
  | "endsAt"
  | "maxRedemptions"
  | "perUserLimit"
  | "active"
>

const TYPE_ITEMS = DISCOUNT_TYPES.map((type) => ({ value: type, label: DISCOUNT_TYPE_LABELS[type] }))
const asErrors = (messages?: string[]) => messages?.map((message) => ({ message }))

/**
 * Creates (`discount` null) or edits a discount code through `saveDiscountCode`. The value field
 * follows the type: a whole percent, a dollar amount, or nothing for free shipping. Dates are whole
 * days in UTC, the end date being the last day the code works. Server-side errors show inline and
 * every typed value stays; a successful save redirects to the list with a toast.
 */
export function DiscountCodeForm({ discount }: { discount: EditableDiscountCode | null }) {
  const [action] = useState(() => saveDiscountCode.bind(null, discount?.id ?? null))
  const [state, dispatch, saving] = useActionState<DiscountFormState, FormData>(action, undefined)
  const [, startTransition] = useTransition()
  const [type, setType] = useState<DiscountType>(discount?.type ?? "percent")

  const errors: Partial<Record<DiscountFormField, string[]>> = state?.errors ?? {}
  const invalid = (field: DiscountFormField) => (errors[field] ? true : undefined)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Dispatching ourselves (rather than <form action>) keeps every typed value: React resets a
    // form after its action runs.
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(() => dispatch(formData))
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={discount ? "Edit discount code" : "New discount code"}
      className="space-y-6"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Code</CardTitle>
              <CardDescription>What customers type at checkout. Letters are stored in capitals.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-5">
                <Field data-invalid={invalid("code")}>
                  <FieldLabel htmlFor="discount-code">Code</FieldLabel>
                  <Input
                    id="discount-code"
                    name="code"
                    defaultValue={discount?.code}
                    maxLength={MAX_CODE_LENGTH}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="e.g. SPRING20"
                    className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
                    aria-invalid={invalid("code")}
                  />
                  <FieldDescription>3–32 letters, digits, dashes or underscores; unique.</FieldDescription>
                  <FieldError errors={asErrors(errors.code)} />
                </Field>
                <Field data-invalid={invalid("description")}>
                  <FieldLabel htmlFor="discount-description">Description</FieldLabel>
                  <Input
                    id="discount-description"
                    name="description"
                    defaultValue={discount?.description}
                    maxLength={MAX_DISCOUNT_DESCRIPTION_LENGTH}
                    placeholder="Optional, for the admin list"
                    aria-invalid={invalid("description")}
                  />
                  <FieldError errors={asErrors(errors.description)} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Discount</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field data-invalid={invalid("type")}>
                    <FieldLabel id="discount-type-label">Type</FieldLabel>
                    <Select<DiscountType>
                      name="type"
                      items={TYPE_ITEMS}
                      value={type}
                      onValueChange={(value) => value && setType(value)}
                    >
                      <SelectTrigger
                        aria-labelledby="discount-type-label"
                        aria-invalid={invalid("type")}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={asErrors(errors.type)} />
                  </Field>
                  {type !== "free_shipping" && (
                    <Field data-invalid={invalid("value")}>
                      <FieldLabel htmlFor="discount-value">{type === "percent" ? "Percent off" : "Amount off"}</FieldLabel>
                      <InputGroup>
                        {type === "fixed" && (
                          <InputGroupAddon>
                            <InputGroupText>$</InputGroupText>
                          </InputGroupAddon>
                        )}
                        <InputGroupInput
                          // Remounts on a type change, so a percent isn't carried over as dollars.
                          key={type}
                          id="discount-value"
                          name="value"
                          inputMode={type === "percent" ? "numeric" : "decimal"}
                          placeholder={type === "percent" ? "10" : "15.00"}
                          defaultValue={discount?.type === type ? discountValueToInput(type, discount.value) : undefined}
                          aria-invalid={invalid("value")}
                        />
                        {type === "percent" && (
                          <InputGroupAddon align="inline-end">
                            <InputGroupText>%</InputGroupText>
                          </InputGroupAddon>
                        )}
                      </InputGroup>
                      <FieldError errors={asErrors(errors.value)} />
                    </Field>
                  )}
                </div>
                {type === "free_shipping" && (
                  <FieldDescription>Shipping is free with any method while the code applies.</FieldDescription>
                )}
                <Field data-invalid={invalid("minSubtotal")}>
                  <FieldLabel htmlFor="discount-min-subtotal">Minimum subtotal</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="discount-min-subtotal"
                      name="minSubtotal"
                      inputMode="decimal"
                      placeholder="None"
                      defaultValue={discount && discount.minSubtotalCents > 0 ? centsToDollars(discount.minSubtotalCents) : undefined}
                      aria-invalid={invalid("minSubtotal")}
                    />
                  </InputGroup>
                  <FieldDescription>The cart subtotal (after sale prices) the code needs. Empty for none.</FieldDescription>
                  <FieldError errors={asErrors(errors.minSubtotal)} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Availability</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-5">
                <Field orientation="horizontal">
                  <Switch id="discount-active" name="active" defaultChecked={discount?.active ?? true} />
                  <FieldLabel htmlFor="discount-active">Active</FieldLabel>
                </Field>
                <Field data-invalid={invalid("startsOn")}>
                  <FieldLabel htmlFor="discount-starts-on">Start date</FieldLabel>
                  <Input
                    id="discount-starts-on"
                    name="startsOn"
                    type="date"
                    defaultValue={startsAtToDateInput(discount?.startsAt ?? null)}
                    aria-invalid={invalid("startsOn")}
                  />
                  <FieldError errors={asErrors(errors.startsOn)} />
                </Field>
                <Field data-invalid={invalid("endsOn")}>
                  <FieldLabel htmlFor="discount-ends-on">End date</FieldLabel>
                  <Input
                    id="discount-ends-on"
                    name="endsOn"
                    type="date"
                    defaultValue={endsAtToDateInput(discount?.endsAt ?? null)}
                    aria-invalid={invalid("endsOn")}
                  />
                  <FieldDescription>The last day it works (UTC). Leave dates empty for no limit.</FieldDescription>
                  <FieldError errors={asErrors(errors.endsOn)} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Limits</CardTitle>
              <CardDescription>Cancelled and rejected orders give their use back.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-5">
                <Field data-invalid={invalid("maxRedemptions")}>
                  <FieldLabel htmlFor="discount-max-redemptions">Total uses</FieldLabel>
                  <Input
                    id="discount-max-redemptions"
                    name="maxRedemptions"
                    inputMode="numeric"
                    placeholder="Unlimited"
                    defaultValue={discount?.maxRedemptions ?? undefined}
                    aria-invalid={invalid("maxRedemptions")}
                  />
                  <FieldError errors={asErrors(errors.maxRedemptions)} />
                </Field>
                <Field data-invalid={invalid("perUserLimit")}>
                  <FieldLabel htmlFor="discount-per-user-limit">Uses per customer</FieldLabel>
                  <Input
                    id="discount-per-user-limit"
                    name="perUserLimit"
                    inputMode="numeric"
                    placeholder="Unlimited"
                    defaultValue={discount ? (discount.perUserLimit ?? undefined) : 1}
                    aria-invalid={invalid("perUserLimit")}
                  />
                  <FieldError errors={asErrors(errors.perUserLimit)} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/70 sm:mx-0 sm:rounded-xl sm:border">
        {state?.message && (
          <Alert variant="destructive" className="mb-3">
            <CircleAlert />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href={ADMIN_DISCOUNTS_PATH} className={buttonVariants({ variant: "outline" })}>
            Cancel
          </Link>
          <Button type="submit" disabled={saving}>
            {saving && <Spinner data-icon="inline-start" aria-hidden />}
            {saving ? "Saving…" : discount ? "Save changes" : "Create code"}
          </Button>
        </div>
      </div>
    </form>
  )
}
