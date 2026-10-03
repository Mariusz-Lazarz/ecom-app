"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"

import { deleteDiscountCode } from "@/app/actions/admin-discounts"
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

// The rejection a Server Action's redirect() leaves on the client call.
const isRedirect = (err: unknown) =>
  typeof (err as { digest?: unknown } | null)?.digest === "string" &&
  (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")

type DeleteDiscountButtonProps = { id: string; code: string; redemptionCount: number }

/**
 * "Delete" with a confirmation dialog, only for codes that were never redeemed; a redeemed code
 * gets a disabled button with the reason (deactivate it instead). The `deleteDiscountCode` Server
 * Action redirects to the list with a toast on success; a failure is reported in a toast here.
 */
export function DeleteDiscountButton({ id, code, redemptionCount }: DeleteDiscountButtonProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  if (redemptionCount > 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="destructive" disabled aria-describedby="delete-discount-reason">
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
        <p id="delete-discount-reason" className="text-xs text-muted-foreground">
          Used {redemptionCount} {redemptionCount === 1 ? "time" : "times"}: deactivate it instead.
        </p>
      </div>
    )
  }

  const confirm = () => {
    startTransition(async () => {
      try {
        const result = await deleteDiscountCode(id)
        notify.error("Couldn't delete the code", { description: result.message })
      } catch (err) {
        // A successful delete redirects: the router is already on its way to the list.
        if (isRedirect(err)) return
        notify.error("Couldn't delete the code", { description: GENERIC_MESSAGE })
      }
      setOpen(false)
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trash2 data-icon="inline-start" />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {code}?</AlertDialogTitle>
          <AlertDialogDescription>
            Customers won&apos;t be able to use it any more, and carts holding it drop it. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep code</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={confirm}>
            {pending && <Spinner data-icon="inline-start" aria-hidden />}
            {pending ? "Deleting…" : "Delete code"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
