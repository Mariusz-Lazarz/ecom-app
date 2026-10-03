"use client"

import { useActionState, useState } from "react"
import { Pencil, Plus } from "lucide-react"

import { saveAddress } from "@/app/actions/addresses"
import { AddressFields } from "@/components/addresses/address-fields"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { notify } from "@/lib/notify"
import type { SavedAddress } from "@/lib/addresses"
import type { AddressFormState, AddressValues } from "@/lib/validation/addresses"

type EditableAddress = Omit<SavedAddress, "createdAt" | "updatedAt">

type AddressDialogProps = {
  // The address to edit; without one the dialog adds a new address.
  address?: EditableAddress
  // Prefill for a new address (e.g. the account's name).
  defaults?: AddressValues
  disabled?: boolean
}

/**
 * "Add address" / "Edit" button with a dialog holding the address form. Saves through the
 * `saveAddress` Server Action; on success the dialog closes with a toast, otherwise errors show
 * inline with the typed values kept.
 */
export function AddressDialog({ address, defaults, disabled }: AddressDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {address ? (
        <DialogTrigger render={<Button variant="outline" size="sm" aria-label={`Edit ${address.label}`} />}>
          <Pencil data-icon="inline-start" />
          Edit
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button disabled={disabled} />}>
          <Plus data-icon="inline-start" />
          Add address
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{address ? `Edit ${address.label}` : "Add an address"}</DialogTitle>
          <DialogDescription>
            {address ? "Changes apply to future orders only." : "Save an address to pick it at checkout."}
          </DialogDescription>
        </DialogHeader>
        <AddressForm address={address} defaults={defaults} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function toValues(address: EditableAddress): AddressValues {
  return {
    label: address.label,
    fullName: address.fullName,
    line1: address.line1,
    line2: address.line2 ?? "",
    city: address.city,
    postalCode: address.postalCode,
    country: address.country,
    phone: address.phone,
  }
}

function AddressForm({
  address,
  defaults,
  onSaved,
}: {
  address?: EditableAddress
  defaults?: AddressValues
  onSaved: () => void
}) {
  const [state, action, pending] = useActionState<AddressFormState, FormData>(async (previous, formData) => {
    const result = await saveAddress(previous, formData)
    if (result?.success) {
      notify.success(address ? "Address updated" : "Address saved")
      onSaved()
    }
    return result
  }, undefined)
  const values = state?.values ?? (address ? toValues(address) : (defaults ?? {}))
  const errors = state?.errors
  const labelError = errors?.label?.[0]

  // key remounts the fields when the action echoes values back, so their defaultValue picks them up.
  return (
    <form action={action} noValidate className="grid gap-4" key={JSON.stringify(state?.values ?? null)}>
      {address && <input type="hidden" name="id" value={address.id} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={labelError ? true : undefined} className="sm:col-span-2">
          <FieldLabel htmlFor="address-label">Label</FieldLabel>
          <Input
            id="address-label"
            name="label"
            placeholder="Home, Office…"
            defaultValue={values.label ?? ""}
            required
            aria-invalid={labelError ? true : undefined}
            aria-describedby={labelError ? "address-label-error" : undefined}
            className="h-10"
          />
          <FieldError id="address-label-error">{labelError}</FieldError>
        </Field>
        <AddressFields idPrefix="address" values={values} errors={errors} />
      </FieldGroup>
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" disabled={pending} />}>Cancel</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" aria-hidden />}
          {pending ? "Saving…" : "Save address"}
        </Button>
      </DialogFooter>
    </form>
  )
}
