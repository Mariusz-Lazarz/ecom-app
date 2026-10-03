"use client"

import { useActionState } from "react"
import Link from "next/link"

import { login } from "@/app/actions/login"
import { Field } from "@/components/auth/field"
import { Button } from "@/components/ui/button"
import { CALLBACK_PARAM } from "@/lib/safe-redirect"
import type { LoginFormState } from "@/lib/validation/login"

/** `callbackUrl` is where to go after signing in; the action re-checks that it's a same-origin path. */
export function LoginForm({ callbackUrl }: { callbackUrl?: string | null }) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(login, undefined)
  const errors = state?.errors

  // On success the action redirects, so the form only ever re-renders with errors.
  // key forces inputs to remount so defaultValue picks up the email echoed back by the action.
  return (
    <form action={action} noValidate className="space-y-4" key={JSON.stringify(state?.values)}>
      {callbackUrl && <input type="hidden" name={CALLBACK_PARAM} value={callbackUrl} />}
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
        autoComplete="current-password"
        errors={errors?.password}
      />
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-10 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New to Northcart?{" "}
        <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  )
}
