"use client"

import { useActionState } from "react"
import Link from "next/link"
import { MailCheck } from "lucide-react"

import { requestPasswordReset } from "@/app/actions/password-reset"
import { Field } from "@/components/auth/field"
import { Button, buttonVariants } from "@/components/ui/button"
import type { ForgotPasswordFormState } from "@/lib/validation/password-reset"

const linkClass = "font-medium text-foreground underline-offset-4 hover:underline"

/**
 * Asks for the account's email and requests a reset link. The answer is the same whether or not
 * the email has an account.
 */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ForgotPasswordFormState, FormData>(requestPasswordReset, undefined)

  if (state?.success) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
        <MailCheck className="size-10 text-primary" />
        <h2 className="text-lg font-semibold">Check your inbox</h2>
        <p className="text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground break-all">{state.values?.email}</span>,
          we&apos;ve sent a link to reset your password. It expires in 1 hour.
        </p>
        <p className="text-sm text-muted-foreground">
          Didn&apos;t get it? Check your spam folder or try again in a minute.
        </p>
        <Link href="/login" className={buttonVariants({ variant: "outline", className: "mt-2 h-10 px-4" })}>
          Back to sign in
        </Link>
      </div>
    )
  }

  // key forces the input to remount so defaultValue picks up the email echoed back by the action.
  return (
    <form action={action} noValidate className="space-y-4" key={JSON.stringify(state?.values)}>
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        defaultValue={state?.values?.email}
        errors={state?.errors?.email}
      />
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-10 w-full">
        {pending ? "Sending link…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className={linkClass}>
          Sign in
        </Link>
      </p>
    </form>
  )
}
