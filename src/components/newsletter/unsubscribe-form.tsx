"use client"

import { useActionState } from "react"
import Link from "next/link"
import { CircleCheck, Mail } from "lucide-react"

import { unsubscribeFromNewsletter, type UnsubscribeState } from "@/app/actions/newsletter"
import { Button, buttonVariants } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** One-click confirmation for the unsubscribe link, then the outcome. */
export function UnsubscribeForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<UnsubscribeState, FormData>(unsubscribeFromNewsletter, undefined)

  if (state?.status === "unsubscribed") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
        <CircleCheck aria-hidden className="size-10 text-emerald-600 dark:text-emerald-400" />
        <h2 className="text-lg font-semibold">You&apos;ve been unsubscribed</h2>
        <p className="text-sm text-muted-foreground">
          We won&apos;t send any more newsletters to{" "}
          <span className="font-medium break-all text-foreground">{state.email}</span>. Changed your mind? You
          can sign up again on the home page.
        </p>
        <Link href="/" className={buttonVariants({ className: "mt-2 h-10 px-4" })}>
          Back to the store
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col items-center gap-3 py-4 text-center">
      <input type="hidden" name="token" value={token} />
      <Mail aria-hidden className="size-10 text-muted-foreground" />
      <h2 className="text-lg font-semibold">Unsubscribe from the newsletter?</h2>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium break-all text-foreground">{email}</span> will stop getting Northcart
        newsletters. Order and account emails aren&apos;t affected.
      </p>
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-2 h-10 px-4">
        {pending && <Spinner data-icon="inline-start" aria-hidden />}
        {pending ? "Unsubscribing…" : "Unsubscribe"}
      </Button>
    </form>
  )
}
