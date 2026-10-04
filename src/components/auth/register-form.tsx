"use client"

import { useActionState } from "react"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

import { register } from "@/app/actions/register"
import { Field } from "@/components/auth/field"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field as UiField, FieldLabel } from "@/components/ui/field"
import type { RegisterFormState } from "@/lib/validation/register"

export function RegisterForm() {
  const [state, action, pending] = useActionState<RegisterFormState, FormData>(register, undefined)

  if (state?.success) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-10 text-primary" />
        <h2 className="text-lg font-semibold">Welcome aboard, {state.firstName}!</h2>
        <p className="text-sm text-muted-foreground">Your Northcart account has been created.</p>
        <Link href="/" className={buttonVariants({ className: "mt-2 h-10 px-4" })}>
          Start shopping
        </Link>
      </div>
    )
  }

  const errors = state?.errors
  // key forces inputs to remount so defaultValue picks up the values echoed back by the action.
  return (
    <form action={action} noValidate className="space-y-4" key={JSON.stringify(state?.values)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="firstName"
          label="First name"
          autoComplete="given-name"
          defaultValue={state?.values?.firstName}
          errors={errors?.firstName}
        />
        <Field
          name="lastName"
          label="Last name"
          autoComplete="family-name"
          defaultValue={state?.values?.lastName}
          errors={errors?.lastName}
        />
      </div>
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        defaultValue={state?.values?.email}
        errors={errors?.email}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        errors={errors?.password && ["Password must:", ...errors.password]}
      />
      <Field
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        errors={errors?.confirmPassword}
      />
      <UiField orientation="horizontal">
        <Checkbox id="register-newsletter" name="newsletter" defaultChecked={state?.values?.newsletter} />
        <FieldLabel htmlFor="register-newsletter" className="font-normal">
          Subscribe to the newsletter (10% off your first order)
        </FieldLabel>
      </UiField>
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-10 w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
