"use client"

import { useActionState, useState } from "react"

import { updateProfile } from "@/app/actions/account"
import { TextField } from "@/components/account/text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import type { ProfileFormState } from "@/lib/validation/account"

type ProfileFormProps = {
  profile: { firstName: string; lastName: string; email: string }
}

/**
 * Edits the name and email through the `updateProfile` Server Action. The current password field
 * appears once the email is changed (the action requires it then). Field errors show inline with
 * the typed values kept; the password is never kept. Success is reported with a toast.
 */
export function ProfileForm({ profile }: ProfileFormProps) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(updateProfile, undefined)
  const values = { ...profile, ...state?.values }
  // After a save the action's values are the stored ones, even before the page re-renders.
  const savedEmail = state?.success ? values.email : profile.email

  // key remounts the fields when the action echoes values back, so their defaultValue picks them up.
  return (
    <ProfileFields
      key={JSON.stringify(state ?? null)}
      savedEmail={savedEmail}
      values={values}
      state={state}
      action={action}
      pending={pending}
    />
  )
}

function ProfileFields({
  savedEmail,
  values,
  state,
  action,
  pending,
}: {
  savedEmail: string
  values: ProfileFormProps["profile"]
  state: ProfileFormState
  action: (formData: FormData) => void
  pending: boolean
}) {
  const [email, setEmail] = useState(values.email)
  const errors = state?.errors
  const emailChanged = email.trim().toLowerCase() !== savedEmail.toLowerCase()

  return (
    <form action={action} noValidate className="space-y-6">
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField
          form="profile"
          name="firstName"
          label="First name"
          autoComplete="given-name"
          defaultValue={values.firstName}
          errors={errors?.firstName}
        />
        <TextField
          form="profile"
          name="lastName"
          label="Last name"
          autoComplete="family-name"
          defaultValue={values.lastName}
          errors={errors?.lastName}
        />
        <TextField
          form="profile"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          defaultValue={values.email}
          errors={errors?.email}
          onChange={setEmail}
          className="sm:col-span-2"
        />
        {(emailChanged || errors?.currentPassword) && (
          <TextField
            form="profile"
            name="currentPassword"
            label="Current password"
            type="password"
            autoComplete="current-password"
            description="Confirm it's you to change your email."
            errors={errors?.currentPassword}
            className="sm:col-span-2"
          />
        )}
      </FieldGroup>
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-10">
        {pending && <Spinner data-icon="inline-start" aria-hidden />}
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  )
}
