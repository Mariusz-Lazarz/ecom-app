"use client"

import { useState, useTransition } from "react"
import { Eye, EyeOff, Trash2 } from "lucide-react"

import { deleteReview, setReviewStatus } from "@/app/actions/reviews"
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
import type { ReviewStatus } from "@/lib/validation/reviews"

type ReviewActionsProps = { id: string; status: ReviewStatus; title: string; author: string }

/**
 * Moderation for one review: Hide / Unhide straight away, and Delete after a confirmation. The
 * Server Actions refresh the page (and the product's rating); outcomes are reported in toasts.
 */
export function ReviewActions({ id, status, title, author }: ReviewActionsProps) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [deleting, startDelete] = useTransition()
  const hidden = status === "hidden"

  const toggle = () => {
    startTransition(async () => {
      try {
        const result = await setReviewStatus(id, hidden ? "published" : "hidden")
        if (result.ok) notify.success(hidden ? "Review published" : "Review hidden", { description: result.message })
        else notify.error("Couldn't change the review", { description: result.message })
      } catch {
        notify.error("Couldn't change the review", { description: GENERIC_MESSAGE })
      }
    })
  }

  const confirmDelete = () => {
    startDelete(async () => {
      try {
        const result = await deleteReview(id)
        if (result.ok) notify.success("Review deleted", { description: result.message })
        else notify.error("Couldn't delete the review", { description: result.message })
      } catch {
        notify.error("Couldn't delete the review", { description: GENERIC_MESSAGE })
      }
      setOpen(false)
    })
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" disabled={pending} onClick={toggle} aria-label={`${hidden ? "Unhide" : "Hide"} review “${title}” by ${author}`}>
        {pending ? <Spinner data-icon="inline-start" aria-hidden /> : hidden ? <Eye data-icon="inline-start" /> : <EyeOff data-icon="inline-start" />}
        {hidden ? "Unhide" : "Hide"}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !deleting && setOpen(next)}>
        <AlertDialogTrigger
          render={<Button variant="ghost" size="sm" className="text-destructive" aria-label={`Delete review “${title}” by ${author}`} />}
        >
          <Trash2 />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              “{title}” by {author} is removed for good and no longer counts towards the product&apos;s rating. To take
              it off the store but keep it, hide it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep review</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {deleting && <Spinner data-icon="inline-start" aria-hidden />}
              {deleting ? "Deleting…" : "Delete review"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
