"use client"

import { useActionState } from "react"
import { CircleAlert, MailCheck } from "lucide-react"

import { subscribeToNewsletter } from "@/app/actions/newsletter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import type { NewsletterFormState } from "@/lib/validation/newsletter"

/**
 * The home page's newsletter sign-up, styled for the dark promo panel. Errors show under the field;
 * on success the form gives way to a confirmation, the same whether or not the address was already
 * on the list.
 */
export function NewsletterForm() {
  const [state, action, pending] = useActionState<NewsletterFormState, FormData>(subscribeToNewsletter, undefined)

  if (state?.success) {
    return (
      <div role="status" className="flex max-w-md items-start gap-3 rounded-xl bg-primary-foreground/10 p-4">
        <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">You&apos;re on the list!</p>
          <p className="text-sm text-primary-foreground/70">
            We&apos;ve sent a confirmation with your welcome code to{" "}
            <span className="font-medium break-all text-primary-foreground">{state.email}</span>.
          </p>
        </div>
      </div>
    )
  }

  const error = state?.errors?.email?.[0] ?? state?.message
  return (
    <form action={action} noValidate className="max-w-md space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <Input
          // Remount so the field shows the value the action echoed back.
          key={state?.values?.email ?? ""}
          id="newsletter-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.values?.email}
          placeholder="you@example.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "newsletter-email-error" : undefined}
          className="h-10 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/50"
        />
        <Button type="submit" variant="secondary" disabled={pending} className="h-10 px-4">
          {pending && <Spinner data-icon="inline-start" aria-hidden />}
          {pending ? "Subscribing…" : "Subscribe"}
        </Button>
      </div>
      {error && (
        <p id="newsletter-email-error" role="alert" className="flex items-center gap-1.5 text-sm font-medium">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </form>
  )
}
