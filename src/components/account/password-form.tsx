"use client"

import { useActionState } from "react"

import { changePassword } from "@/app/actions/account"
import { TextField } from "@/components/account/text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import type { PasswordChangeFormState } from "@/lib/validation/account"

/**
 * Changes the password through the `changePassword` Server Action. Errors show inline; the fields
 * are always cleared after a submit, since passwords are never echoed back. Success is reported
 * with a toast and the user stays signed in.
 */
export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordChangeFormState, FormData>(changePassword, undefined)
  const errors = state?.errors

  return (
    <form action={action} noValidate className="space-y-6">
      <FieldGroup className="max-w-md gap-4">
        <TextField
          form="password"
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          errors={errors?.currentPassword}
        />
        <TextField
          form="password"
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          description="At least 8 characters, with a letter and a number."
          errors={errors?.newPassword}
        />
        <TextField
          form="password"
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          errors={errors?.confirmPassword}
        />
      </FieldGroup>
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-10">
        {pending && <Spinner data-icon="inline-start" aria-hidden />}
        {pending ? "Changing password…" : "Change password"}
      </Button>
    </form>
  )
}
