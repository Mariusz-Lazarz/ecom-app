"use client"

import { useState, useTransition } from "react"

import { cancelOrder } from "@/app/actions/orders"
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

/**
 * "Cancel order" with a confirmation dialog. Runs the `cancelOrder` Server Action, which refreshes
 * the page on success, and reports the outcome in a toast.
 */
export function CancelOrderButton({ number }: { number: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const confirm = () => {
    startTransition(async () => {
      try {
        const result = await cancelOrder(number)
        if (result.ok) notify.success("Order cancelled", { description: result.message })
        else notify.error("Couldn't cancel the order", { description: result.message })
      } catch {
        notify.error("Couldn't cancel the order", { description: GENERIC_MESSAGE })
      }
      setOpen(false)
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger render={<Button variant="outline" />}>Cancel order</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel order {number}?</AlertDialogTitle>
          <AlertDialogDescription>
            The order won&apos;t be shipped and its items go back in stock. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep order</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={confirm}>
            {pending && <Spinner data-icon="inline-start" aria-hidden />}
            {pending ? "Cancelling…" : "Cancel order"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
