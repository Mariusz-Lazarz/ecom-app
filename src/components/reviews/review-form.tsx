"use client"

import { useActionState, useEffect, useId, useState, useTransition } from "react"
import { EyeOff, Trash2 } from "lucide-react"

import { deleteMyReview, saveReview } from "@/app/actions/reviews"
import { StarRatingInput } from "@/components/reviews/star-rating-input"
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { GENERIC_MESSAGE } from "@/lib/errors"
import { notify } from "@/lib/notify"
import {
  MAX_REVIEW_BODY_LENGTH,
  MAX_REVIEW_TITLE_LENGTH,
  MIN_REVIEW_BODY_LENGTH,
  type ReviewFormState,
  type ReviewStatus,
} from "@/lib/validation/reviews"

export type EditableReview = { rating: number; title: string; body: string; status: ReviewStatus }

type ReviewFormProps = {
  productId: string
  slug: string
  productName: string
  // The customer's existing review, to edit; null to write one.
  review: EditableReview | null
}

const asErrors = (messages?: string[]) => messages?.map((message) => ({ message }))

/**
 * Writes or edits the signed-in customer's review through the `saveReview` Server Action, which
 * re-renders the page with the new review and rating; the outcome is confirmed in a toast. The
 * fields remount (and take their new defaults) whenever the saved review or the echoed values change. An
 * existing review can also be deleted (with a confirmation).
 */
export function ReviewForm({ productId, slug, productName, review }: ReviewFormProps) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(
    saveReview.bind(null, productId, slug),
    undefined,
  )
  const ids = { rating: useId(), title: useId(), body: useId(), ratingError: useId() }

  useEffect(() => {
    if (state?.ok && state.message) notify.success(state.message)
    else if (state?.message && !state.errors) notify.error("Couldn't save your review", { description: state.message })
  }, [state])

  const errors = state?.ok ? undefined : state?.errors
  const values = state?.ok ? undefined : state?.values
  const rating = values?.rating !== undefined ? Number(values.rating) : review?.rating

  return (
    <div className="space-y-4">
      {review?.status === "hidden" && (
        <Alert>
          <EyeOff />
          <AlertTitle>Your review is hidden</AlertTitle>
          <AlertDescription>
            Our moderators have hidden it from the store, so it doesn&apos;t count towards the rating.
          </AlertDescription>
        </Alert>
      )}
      <form action={action} noValidate aria-label={review ? "Edit your review" : "Write a review"} key={JSON.stringify([values, review])}>
        <FieldGroup>
          <Field data-invalid={errors?.rating ? true : undefined}>
            <FieldTitle id={ids.rating}>Your rating</FieldTitle>
            <StarRatingInput
              name="rating"
              defaultValue={rating}
              labelledBy={ids.rating}
              invalid={Boolean(errors?.rating)}
              describedBy={errors?.rating ? ids.ratingError : undefined}
            />
            <FieldError id={ids.ratingError} errors={asErrors(errors?.rating)} />
          </Field>
          <Field data-invalid={errors?.title ? true : undefined}>
            <FieldLabel htmlFor={ids.title}>Title</FieldLabel>
            <Input
              id={ids.title}
              name="title"
              defaultValue={values?.title ?? review?.title}
              maxLength={MAX_REVIEW_TITLE_LENGTH}
              placeholder="Sum it up in a few words"
              aria-invalid={errors?.title ? true : undefined}
            />
            <FieldError errors={asErrors(errors?.title)} />
          </Field>
          <Field data-invalid={errors?.body ? true : undefined}>
            <FieldLabel htmlFor={ids.body}>Review</FieldLabel>
            <BodyInput
              id={ids.body}
              defaultValue={values?.body ?? review?.body ?? ""}
              productName={productName}
              invalid={Boolean(errors?.body)}
            />
            <FieldError errors={asErrors(errors?.body)} />
          </Field>
        </FieldGroup>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" aria-hidden />}
            {pending ? "Saving…" : review ? "Update review" : "Submit review"}
          </Button>
          {review && <DeleteReviewButton productId={productId} slug={slug} />}
        </div>
      </form>
    </div>
  )
}

// Its own component so the character count starts over whenever the form remounts.
function BodyInput({
  id,
  defaultValue,
  productName,
  invalid,
}: {
  id: string
  defaultValue: string
  productName: string
  invalid: boolean
}) {
  const [length, setLength] = useState(defaultValue.length)
  return (
    <>
      <Textarea
        id={id}
        name="body"
        rows={5}
        defaultValue={defaultValue}
        maxLength={MAX_REVIEW_BODY_LENGTH}
        onChange={(event) => setLength(event.target.value.length)}
        placeholder={`What did you like or dislike about the ${productName}?`}
        aria-invalid={invalid || undefined}
        className="min-h-28"
      />
      <FieldDescription className="flex justify-between gap-2">
        <span>At least {MIN_REVIEW_BODY_LENGTH} characters.</span>
        <span className="tabular-nums">
          {length}/{MAX_REVIEW_BODY_LENGTH}
        </span>
      </FieldDescription>
    </>
  )
}

function DeleteReviewButton({ productId, slug }: { productId: string; slug: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const confirm = () => {
    startTransition(async () => {
      try {
        const result = await deleteMyReview(productId, slug)
        if (result.ok) notify.success(result.message)
        else notify.error("Couldn't delete your review", { description: result.message })
      } catch {
        notify.error("Couldn't delete your review", { description: GENERIC_MESSAGE })
      }
      setOpen(false)
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger render={<Button type="button" variant="ghost" className="text-destructive" />}>
        <Trash2 data-icon="inline-start" />
        Delete review
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your review?</AlertDialogTitle>
          <AlertDialogDescription>
            It disappears from the product page and no longer counts towards the rating. You can write a new one later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep review</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={confirm}>
            {pending && <Spinner data-icon="inline-start" aria-hidden />}
            {pending ? "Deleting…" : "Delete review"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
