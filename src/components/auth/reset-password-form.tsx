"use client"

import { useActionState } from "react"

import { resetPassword } from "@/app/actions/password-reset"
import { Field } from "@/components/auth/field"
import { InvalidResetLink } from "@/components/auth/invalid-reset-link"
import { Button } from "@/components/ui/button"
import type { ResetPasswordFormState } from "@/lib/validation/password-reset"

/**
 * Sets a new password with the token from the reset link. On success the action redirects to
 * /login with a toast; a token that stopped working meanwhile swaps the form for a link to request
 * a new one. Passwords are never echoed back, so the fields clear after each submit.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetPasswordFormState, FormData>(resetPassword, undefined)

  if (state?.invalidToken) return <InvalidResetLink />

  const errors = state?.errors
  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        errors={errors?.password && ["Password must:", ...errors.password]}
      />
      {!errors?.password && (
        <p className="-mt-2 text-xs text-muted-foreground">At least 8 characters, with a letter and a number.</p>
      )}
      <Field
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        errors={errors?.confirmPassword}
      />
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-10 w-full">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  )
}
