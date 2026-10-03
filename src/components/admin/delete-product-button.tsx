"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"

import { deleteProduct } from "@/app/actions/admin-products"
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

type DeleteProductButtonProps = { id: string; name: string; orderLineCount: number }

/**
 * "Delete" with a confirmation dialog that says what happens to orders and carts. The
 * `deleteProduct` Server Action redirects to the product list with a toast on success; a failure
 * is reported in a toast here.
 */
export function DeleteProductButton({ id, name, orderLineCount }: DeleteProductButtonProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const confirm = () => {
    startTransition(async () => {
      try {
        const result = await deleteProduct(id)
        notify.error("Couldn't delete the product", { description: result.message })
      } catch (err) {
        // A successful delete redirects: the router is already on its way to the list.
        if (isRedirect(err)) return
        notify.error("Couldn't delete the product", { description: GENERIC_MESSAGE })
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
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It disappears from the store and from every shopping cart, along with its images.{" "}
            {orderLineCount > 0
              ? `It appears in ${orderLineCount} ${orderLineCount === 1 ? "order line" : "order lines"}: past orders keep their copy of the name, price and photo.`
              : "Past orders would keep their copy of the name, price and photo."}{" "}
            This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep product</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={confirm}>
            {pending && <Spinner data-icon="inline-start" aria-hidden />}
            {pending ? "Deleting…" : "Delete product"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
