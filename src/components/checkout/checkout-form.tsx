"use client"

import Link from "next/link"
import { useActionState, useId, useState } from "react"
import { CircleAlert, Info, Lock, TicketX } from "lucide-react"

import { placeOrder } from "@/app/actions/orders"
import { CheckoutSummary } from "@/components/checkout/checkout-summary"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import type { Cart } from "@/lib/cart"
import { checkoutBlocker } from "@/lib/cart-state"
import { formatPrice } from "@/lib/catalogue"
import { quoteCheckout } from "@/lib/order-rules"
import { paymentMethods } from "@/lib/payments"
import { formatDeliveryWindow, shippingMethods } from "@/lib/shipping"
import {
  SUPPORTED_COUNTRIES,
  type CheckoutField,
  type CheckoutFormState,
  type CheckoutValues,
} from "@/lib/validation/checkout"

export const DEFAULT_SHIPPING_METHOD_ID = "standard"
export const DEFAULT_PAYMENT_METHOD_ID = "cards"

const COUNTRY_ITEMS = SUPPORTED_COUNTRIES.map((country) => ({ value: country.code, label: country.name }))

type CheckoutFormProps = {
  cart: Cart
  // Prefilled values (e.g. the address of the last order); what the customer typed wins after a failed submit.
  defaults: CheckoutValues
}

/**
 * The checkout: address, shipping method and (simulated) payment method on the left, the order
 * summary with the discount code field and the "Place order" button on the right (below the form
 * on mobile). The totals include the cart's discount code. Posts to the `placeOrder` Server
 * Action, which redirects to the order page on success or returns field errors / a form-level
 * message, shown inline with the values kept.
 */
export function CheckoutForm({ cart, defaults }: CheckoutFormProps) {
  const [state, action, pending] = useActionState<CheckoutFormState, FormData>(placeOrder, undefined)
  const values = state?.values ?? defaults

  // key remounts the fields when the action echoes values back, so their defaultValue picks them up.
  return (
    <form action={action} noValidate key={JSON.stringify(state?.values ?? null)}>
      <CheckoutFields cart={cart} values={values} state={state} pending={pending} />
    </form>
  )
}

function CheckoutFields({
  cart,
  values,
  state,
  pending,
}: {
  cart: Cart
  values: CheckoutValues
  state: CheckoutFormState
  pending: boolean
}) {
  const [shippingMethodId, setShippingMethodId] = useState(
    shippingMethods.some((method) => method.id === values.shippingMethodId)
      ? values.shippingMethodId!
      : DEFAULT_SHIPPING_METHOD_ID,
  )
  const errors = state?.errors
  const discount = cart.discount ?? null
  const quote = quoteCheckout(cart, shippingMethodId, discount)
  const blocker = checkoutBlocker(cart)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start lg:gap-8">
      <div className="space-y-6">
        <AddressCard values={values} errors={errors} />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Shipping method</CardTitle>
            <CardDescription>Delivery times are in business days from dispatch.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              name="shippingMethodId"
              value={shippingMethodId}
              onValueChange={(value) => setShippingMethodId(String(value))}
              aria-label="Shipping method"
              aria-invalid={errors?.shippingMethodId ? true : undefined}
            >
              {shippingMethods.map((method) => {
                const methodQuote = quoteCheckout(cart, method.id, discount)
                const id = `shipping-${method.id}`
                return (
                  <FieldLabel key={method.id} htmlFor={id}>
                    <Field orientation="horizontal">
                      <RadioGroupItem value={method.id} id={id} />
                      <FieldContent>
                        <FieldTitle>
                          {method.name}
                          {method.badge && (
                            <Badge variant="secondary" className="font-normal">
                              {method.badge}
                            </Badge>
                          )}
                        </FieldTitle>
                        <FieldDescription>
                          {formatDeliveryWindow(method)} · {method.description}
                        </FieldDescription>
                      </FieldContent>
                      <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                        {(methodQuote.freeShipping || methodQuote.shippingDiscountCents > 0) && (
                          <span className="mr-1.5 font-normal text-muted-foreground line-through">
                            {formatPrice(methodQuote.shippingMethodPriceCents, cart.currency)}
                          </span>
                        )}
                        {methodQuote.shippingCents === 0 ? "Free" : formatPrice(methodQuote.shippingCents, cart.currency)}
                      </span>
                    </Field>
                  </FieldLabel>
                )
              })}
            </RadioGroup>
            <FieldError className="mt-2">{errors?.shippingMethodId?.[0]}</FieldError>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Payment</CardTitle>
            <CardDescription>Choose how you&apos;d like to pay.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert role="note">
              <Info />
              <AlertTitle>Demo checkout</AlertTitle>
              <AlertDescription>
                This is a demo store; no real payment is taken. Pick any method and your order is marked as paid.
              </AlertDescription>
            </Alert>
            <RadioGroup
              name="paymentMethodId"
              defaultValue={values.paymentMethodId || DEFAULT_PAYMENT_METHOD_ID}
              aria-label="Payment method"
              aria-invalid={errors?.paymentMethodId ? true : undefined}
            >
              {paymentMethods.map((method) => {
                const id = `payment-${method.id}`
                return (
                  <FieldLabel key={method.id} htmlFor={id}>
                    <Field orientation="horizontal">
                      <RadioGroupItem value={method.id} id={id} />
                      <FieldContent>
                        <FieldTitle>
                          {method.name}
                          {method.badge && (
                            <Badge variant="secondary" className="font-normal">
                              {method.badge}
                            </Badge>
                          )}
                        </FieldTitle>
                        <FieldDescription>{method.brands.join(" · ")}</FieldDescription>
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                )
              })}
            </RadioGroup>
            <FieldError>{errors?.paymentMethodId?.[0]}</FieldError>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-32">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Order summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CheckoutSummary cart={cart} quote={quote} />

          {cart.discountNotice && (
            <Alert role="status">
              <TicketX />
              <AlertTitle>Discount code removed</AlertTitle>
              <AlertDescription>{cart.discountNotice}</AlertDescription>
            </Alert>
          )}

          {blocker && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{blocker}</AlertTitle>
              <AlertDescription>
                <Link href="/cart">Review your cart</Link>
              </AlertDescription>
            </Alert>
          )}
          {state?.message && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{state.errors ? state.message : "We couldn't place your order"}</AlertTitle>
              {!state.errors && (
                <AlertDescription>
                  <p>{state.message}</p>
                  <Link href="/cart">Review your cart</Link>
                </AlertDescription>
              )}
            </Alert>
          )}

          <Button type="submit" size="lg" className="h-11 w-full" disabled={pending || blocker !== null}>
            {pending ? (
              <>
                <Spinner data-icon="inline-start" aria-hidden />
                Placing order…
              </>
            ) : (
              <>
                <Lock data-icon="inline-start" />
                Place order · {formatPrice(quote.totalCents, cart.currency)}
              </>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            By placing your order you agree to our demo terms. Nothing will be charged or shipped.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

type Errors = Partial<Record<CheckoutField, string[]>> | undefined

function AddressCard({ values, errors }: { values: CheckoutValues; errors: Errors }) {
  const countryLabelId = useId()
  const country = SUPPORTED_COUNTRIES.some((c) => c.code === values.country) ? values.country : "US"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Shipping address</CardTitle>
        <CardDescription>Where should we send your order?</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="fullName"
            label="Full name"
            autoComplete="name"
            values={values}
            errors={errors}
            className="sm:col-span-2"
          />
          <TextField
            name="line1"
            label="Address"
            autoComplete="address-line1"
            values={values}
            errors={errors}
            className="sm:col-span-2"
          />
          <TextField
            name="line2"
            label="Apartment, suite, etc. (optional)"
            autoComplete="address-line2"
            required={false}
            values={values}
            errors={errors}
            className="sm:col-span-2"
          />
          <TextField name="city" label="City" autoComplete="address-level2" values={values} errors={errors} />
          <TextField name="postalCode" label="Postal code" autoComplete="postal-code" values={values} errors={errors} />
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
          <TextField name="phone" label="Phone" type="tel" autoComplete="tel" values={values} errors={errors} />
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

type TextFieldProps = {
  name: CheckoutField
  label: string
  values: CheckoutValues
  errors: Errors
  type?: string
  autoComplete?: string
  required?: boolean
  className?: string
}

function TextField({ name, label, values, errors, type = "text", autoComplete, required = true, className }: TextFieldProps) {
  const error = errors?.[name]?.[0]
  const id = `checkout-${name}`
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
