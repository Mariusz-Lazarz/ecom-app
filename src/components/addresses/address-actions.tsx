"use client"

import { useState, useTransition } from "react"
import { Star, Trash2 } from "lucide-react"

import { deleteAddress, setDefaultAddress } from "@/app/actions/addresses"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { GENERIC_MESSAGE } from "@/lib/errors"
import { notify } from "@/lib/notify"

type AddressRef = { id: string; label: string }

/** "Set as default" for an address that isn't the default. Reports the outcome in a toast. */
export function SetDefaultAddressButton({ address }: { address: AddressRef }) {
  const [pending, startTransition] = useTransition()

  const run = () =>
    startTransition(async () => {
      try {
        const result = await setDefaultAddress(address.id)
        if (result.ok) notify.success(`${address.label} is now your default address`)
        else notify.error("Couldn't change the default address", { description: result.message })
      } catch {
        notify.error("Couldn't change the default address", { description: GENERIC_MESSAGE })
      }
    })

  return (
    <Button variant="ghost" size="sm" onClick={run} disabled={pending} aria-label={`Set ${address.label} as default`}>
      {pending ? <Spinner data-icon="inline-start" aria-hidden /> : <Star data-icon="inline-start" />}
      Set as default
    </Button>
  )
}

/** "Delete" with a confirmation dialog. Reports the outcome in a toast. */
export function DeleteAddressButton({ address }: { address: AddressRef }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const confirm = () =>
    startTransition(async () => {
      try {
        const result = await deleteAddress(address.id)
        if (result.ok) {
          notify.success("Address deleted")
          setOpen(false)
        } else {
          notify.error("Couldn't delete the address", { description: result.message })
        }
      } catch {
        notify.error("Couldn't delete the address", { description: GENERIC_MESSAGE })
      }
    })

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="sm" className="text-destructive" aria-label={`Delete ${address.label}`} />}
      >
        <Trash2 data-icon="inline-start" />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {address.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            It won&apos;t be offered at checkout any more. Orders already shipped there keep their address.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep address</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={confirm}>
            {pending && <Spinner data-icon="inline-start" aria-hidden />}
            {pending ? "Deleting…" : "Delete address"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
