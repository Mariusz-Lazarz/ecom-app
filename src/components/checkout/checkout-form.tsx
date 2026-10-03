"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { CircleAlert, Info, Lock, TicketX } from "lucide-react"

import { placeOrder } from "@/app/actions/orders"
import { AddressFields } from "@/components/addresses/address-fields"
import { CheckoutSummary } from "@/components/checkout/checkout-summary"
import { countryName } from "@/components/orders/format"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import type { Cart } from "@/lib/cart"
import { checkoutBlocker } from "@/lib/cart-state"
import { formatPrice } from "@/lib/catalogue"
import type { OrderAddress } from "@/lib/orders"
import { quoteCheckout } from "@/lib/order-rules"
import { paymentMethods } from "@/lib/payments"
import { formatDeliveryWindow, shippingMethods } from "@/lib/shipping"
import { NEW_ADDRESS, type CheckoutFormState, type CheckoutValues } from "@/lib/validation/checkout"

export const DEFAULT_SHIPPING_METHOD_ID = "standard"
export const DEFAULT_PAYMENT_METHOD_ID = "cards"

/** A saved address the checkout offers to ship to. */
export type CheckoutAddressOption = OrderAddress & { id: string; label: string; isDefault: boolean }

type CheckoutFormProps = {
  cart: Cart
  // Prefilled values for a new address (e.g. the address of the last order); what the customer typed wins after a failed submit.
  defaults: CheckoutValues
  // The account's saved addresses, offered as a picker above the new address form.
  addresses?: CheckoutAddressOption[]
  // Whether to offer "Save this address to my account" for a new address (false at the limit).
  canSaveAddress?: boolean
}

/**
 * The checkout: address, shipping method and (simulated) payment method on the left, the order
 * summary with the discount code field and the "Place order" button on the right (below the form
 * on mobile). The totals include the cart's discount code. Posts to the `placeOrder` Server
 * Action, which redirects to the order page on success or returns field errors / a form-level
 * message, shown inline with the values kept.
 *
 * With saved addresses the address card is a picker (the default preselected) plus "Use a new
 * address", which reveals the address form; without any it's just the form.
 */
export function CheckoutForm({ cart, defaults, addresses = [], canSaveAddress = false }: CheckoutFormProps) {
  const [state, action, pending] = useActionState<CheckoutFormState, FormData>(placeOrder, undefined)
  const values = state?.values ?? defaults

  // key remounts the fields when the action echoes values back, so their defaultValue picks them up.
  return (
    <form action={action} noValidate key={JSON.stringify(state?.values ?? null)}>
      <CheckoutFields
        cart={cart}
        values={values}
        state={state}
        pending={pending}
        addresses={addresses}
        canSaveAddress={canSaveAddress}
      />
    </form>
  )
}

function CheckoutFields({
  cart,
  values,
  state,
  pending,
  addresses,
  canSaveAddress,
}: {
  cart: Cart
  values: CheckoutValues
  state: CheckoutFormState
  pending: boolean
  addresses: CheckoutAddressOption[]
  canSaveAddress: boolean
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
        <AddressCard values={values} errors={errors} addresses={addresses} canSaveAddress={canSaveAddress} />

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

type Errors = NonNullable<CheckoutFormState>["errors"]

/** The picker's starting choice: the one posted last time, else the default, else the first saved address. */
export function initialAddressChoice(addresses: CheckoutAddressOption[], posted: string | undefined) {
  if (posted === NEW_ADDRESS || addresses.some((address) => address.id === posted)) return posted!
  return (addresses.find((address) => address.isDefault) ?? addresses[0])?.id ?? NEW_ADDRESS
}

function AddressCard({
  values,
  errors,
  addresses,
  canSaveAddress,
}: {
  values: CheckoutValues
  errors: Errors
  addresses: CheckoutAddressOption[]
  canSaveAddress: boolean
}) {
  const [choice, setChoice] = useState(() => initialAddressChoice(addresses, values.addressId))
  const usingNew = choice === NEW_ADDRESS

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Shipping address</CardTitle>
        <CardDescription>Where should we send your order?</CardDescription>
        {addresses.length > 0 && (
          <CardAction>
            <Link href="/account/addresses" className="text-sm font-medium underline-offset-4 hover:underline">
              Manage
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {addresses.length > 0 && (
          <div className="space-y-2">
            <RadioGroup
              name="addressId"
              value={choice}
              onValueChange={(value) => setChoice(String(value))}
              aria-label="Shipping address"
              aria-invalid={errors?.addressId ? true : undefined}
              className="grid gap-3 sm:grid-cols-2"
            >
              {addresses.map((address) => {
                const id = `address-${address.id}`
                return (
                  <FieldLabel key={address.id} htmlFor={id}>
                    <Field orientation="horizontal">
                      <RadioGroupItem value={address.id} id={id} />
                      <FieldContent>
                        <FieldTitle>
                          {address.label}
                          {address.isDefault && (
                            <Badge variant="secondary" className="font-normal">
                              Default
                            </Badge>
                          )}
                        </FieldTitle>
                        <FieldDescription>
                          {address.fullName}
                          <br />
                          {[address.line1, address.line2].filter(Boolean).join(", ")}
                          <br />
                          {address.postalCode} {address.city}, {countryName(address.country)}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                )
              })}
              <FieldLabel htmlFor="address-new" className="sm:col-span-2">
                <Field orientation="horizontal">
                  <RadioGroupItem value={NEW_ADDRESS} id="address-new" />
                  <FieldContent>
                    <FieldTitle>Use a new address</FieldTitle>
                    <FieldDescription>Ship this order somewhere else.</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            </RadioGroup>
            <FieldError>{errors?.addressId?.[0]}</FieldError>
          </div>
        )}
        {usingNew && (
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <AddressFields idPrefix="checkout" values={values} errors={errors} />
            {canSaveAddress && (
              <Field orientation="horizontal" className="sm:col-span-2">
                <Checkbox id="checkout-saveAddress" name="saveAddress" defaultChecked={values.saveAddress === "on"} />
                <FieldLabel htmlFor="checkout-saveAddress" className="font-normal">
                  Save this address to my account
                </FieldLabel>
              </Field>
            )}
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  )
}
