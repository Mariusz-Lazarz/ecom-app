"use client"

import { useActionState, useId, useState } from "react"
import Link from "next/link"
import { MailCheck } from "lucide-react"

import { sendContactMessage } from "@/app/actions/contact"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  CONTACT_HONEYPOT_FIELD,
  CONTACT_MESSAGE_MAX,
  CONTACT_TOPICS,
  type ContactField,
  type ContactFormState,
  type ContactTopic,
} from "@/lib/validation/contact"

type ContactFormProps = {
  // Prefilled from the session for signed-in users.
  defaults: { name?: string; email?: string; topic?: ContactTopic }
  signedIn: boolean
}

const TOPIC_ITEMS = CONTACT_TOPICS.map((topic) => ({ value: topic.value, label: topic.label }))

/**
 * The contact form. Posts to `sendContactMessage` with `useActionState`: errors show under their
 * fields with the typed values kept, a form-level message (rate limit, server error) above the
 * button. After sending it shows a thank-you with a way to write another message.
 */
export function ContactForm(props: ContactFormProps) {
  const [round, setRound] = useState(0)
  return <ContactFormRound key={round} {...props} onAnother={() => setRound((n) => n + 1)} />
}

function ContactFormRound({ defaults, signedIn, onAnother }: ContactFormProps & { onAnother: () => void }) {
  const [state, action, pending] = useActionState<ContactFormState, FormData>(sendContactMessage, undefined)
  const topicLabelId = useId()

  if (state?.success) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
        <MailCheck aria-hidden className="size-10 text-primary" />
        <h2 className="text-lg font-semibold">Thanks, {state.name.split(" ")[0]}! We&apos;ve got your message.</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          We&apos;ll reply to <span className="font-medium break-all text-foreground">{state.email}</span>, usually
          within one business day. A copy of your message is on its way to your inbox.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={onAnother}>
            Send another message
          </Button>
          <Link href="/products" className="inline-flex h-8 items-center px-3 text-sm font-medium underline-offset-4 hover:underline">
            Back to the shop
          </Link>
        </div>
      </div>
    )
  }

  const values: Partial<Record<ContactField, string>> = state?.values ?? defaults
  const errors = state?.errors ?? {}
  const topic = TOPIC_ITEMS.some((item) => item.value === values.topic) ? values.topic : undefined

  return (
    // key: remount the uncontrolled fields so they show the values the action echoed back.
    <form action={action} noValidate key={JSON.stringify(state?.values ?? null)}>
      <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <TextField name="name" label="Name" autoComplete="name" values={values} errors={errors} />
        <TextField name="email" label="Email" type="email" autoComplete="email" values={values} errors={errors} />
        <TextField
          name="orderNumber"
          label="Order number (optional)"
          placeholder="NC-10001"
          required={false}
          description={signedIn ? "One of your orders, if your message is about one." : "If your message is about an order."}
          values={values}
          errors={errors}
        />
        <Field data-invalid={errors.topic ? true : undefined}>
          <FieldLabel id={topicLabelId}>Topic</FieldLabel>
          <Select name="topic" items={TOPIC_ITEMS} defaultValue={topic ?? null}>
            <SelectTrigger
              aria-labelledby={topicLabelId}
              aria-invalid={errors.topic ? true : undefined}
              className="h-10 w-full"
            >
              <SelectValue placeholder="Choose a topic" />
            </SelectTrigger>
            <SelectContent>
              {TOPIC_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{errors.topic?.[0]}</FieldError>
        </Field>
        <MessageField defaultValue={values.message ?? ""} error={errors.message?.[0]} />

        {/* Honeypot: hidden from people and assistive tech, so only bots fill it in. */}
        <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
          <label htmlFor={`contact-${CONTACT_HONEYPOT_FIELD}`}>Leave this field empty</label>
          <input id={`contact-${CONTACT_HONEYPOT_FIELD}`} name={CONTACT_HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="space-y-3 sm:col-span-2">
          {state?.message && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <Button type="submit" disabled={pending} className="h-10 w-full sm:w-auto sm:px-6">
            {pending && <Spinner data-icon="inline-start" aria-hidden />}
            {pending ? "Sending…" : "Send message"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

function MessageField({ defaultValue, error }: { defaultValue: string; error?: string }) {
  const [length, setLength] = useState(defaultValue.length)
  const over = length > CONTACT_MESSAGE_MAX
  return (
    <Field data-invalid={error ? true : undefined} className="sm:col-span-2">
      <FieldLabel htmlFor="contact-message">Message</FieldLabel>
      <Textarea
        id="contact-message"
        name="message"
        rows={6}
        required
        defaultValue={defaultValue}
        onChange={(event) => setLength(event.target.value.length)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "contact-message-error contact-message-count" : "contact-message-count"}
        className="min-h-36"
      />
      <div className="flex items-start justify-between gap-4">
        <FieldError id="contact-message-error">{error}</FieldError>
        <FieldDescription
          id="contact-message-count"
          className={over ? "ml-auto shrink-0 text-destructive" : "ml-auto shrink-0 tabular-nums"}
        >
          {length} / {CONTACT_MESSAGE_MAX}
        </FieldDescription>
      </div>
    </Field>
  )
}

type TextFieldProps = {
  name: Exclude<ContactField, "topic" | "message">
  label: string
  values: Partial<Record<ContactField, string>>
  errors: Partial<Record<ContactField, string[]>>
  type?: string
  autoComplete?: string
  placeholder?: string
  description?: string
  required?: boolean
}

function TextField({ name, label, values, errors, type = "text", autoComplete, placeholder, description, required = true }: TextFieldProps) {
  const error = errors[name]?.[0]
  const id = `contact-${name}`
  const describedBy = [error && `${id}-error`, description && `${id}-description`].filter(Boolean).join(" ")
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={values[name] ?? ""}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="h-10"
      />
      {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  )
}
