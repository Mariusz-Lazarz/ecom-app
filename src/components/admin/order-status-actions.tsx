"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { CircleAlert, Mail, Sparkles } from "lucide-react"

import { changeOrderStatus, type OrderActionResult } from "@/app/actions/orders"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { STATUS_ACTION_LABELS, generateTrackingNumber } from "@/lib/admin-orders"
import { GENERIC_MESSAGE } from "@/lib/errors"
import { notify } from "@/lib/notify"
import { ORDER_TRANSITIONS, RESTOCKING_STATUSES, type OrderStatus } from "@/lib/order-rules"
import { MAX_NOTE_LENGTH, MAX_TRACKING_NUMBER_LENGTH } from "@/lib/validation/orders"

const DESTRUCTIVE: readonly OrderStatus[] = RESTOCKING_STATUSES

const TITLES: Record<OrderStatus, (number: string) => string> = {
  pending: (n) => `Mark ${n} as pending?`,
  processing: (n) => `Start processing ${n}?`,
  shipped: (n) => `Mark ${n} as shipped?`,
  delivered: (n) => `Mark ${n} as delivered?`,
  cancelled: (n) => `Cancel order ${n}?`,
  rejected: (n) => `Reject order ${n}?`,
}

const DESCRIPTIONS: Record<OrderStatus, string> = {
  pending: "The order goes back to pending.",
  processing: "The customer will see that their order is being prepared.",
  shipped: "The customer will see that their order is on its way, with the tracking number if you add one.",
  delivered: "This closes the order as delivered. It can't be changed afterwards.",
  cancelled: "The order won't be shipped and its items go back in stock. This can't be undone.",
  rejected: "The order is refused and its items go back in stock. This can't be undone.",
}

type OrderStatusActionsProps = { number: string; status: OrderStatus }

/**
 * The admin's status buttons: one per status `ORDER_TRANSITIONS` allows from the current one
 * (cancel and reject styled as destructive). Each opens a confirmation dialog with an optional
 * note (and a tracking number for `shipped`) that submits to `changeOrderStatus`: on success it
 * closes with a toast (the action refreshes the page and emails the customer); on failure the
 * errors show in the dialog. A hint next to the buttons says the customer will be emailed. Final
 * statuses get a "No further actions" note instead.
 */
export function OrderStatusActions({ number, status }: OrderStatusActionsProps) {
  const [target, setTarget] = useState<OrderStatus | null>(null)
  const [open, setOpen] = useState(false)
  // Bumped each time a dialog opens, so its form (and the action state) starts fresh.
  const [session, setSession] = useState(0)
  const next = ORDER_TRANSITIONS[status]

  const start = (to: OrderStatus) => {
    setTarget(to)
    setSession((n) => n + 1)
    setOpen(true)
  }

  return (
    <>
      {next.length === 0 ? (
        <p className="text-sm text-muted-foreground">No further actions: this order is final.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex flex-wrap gap-2">
            {next.map((to) => (
              <Button
                key={to}
                variant={DESTRUCTIVE.includes(to) ? "destructive" : to === next[0] ? "default" : "outline"}
                onClick={() => start(to)}
              >
                {STATUS_ACTION_LABELS[to]}
              </Button>
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="size-3.5" aria-hidden />
            Customer will be emailed
          </p>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {target && (
            <StatusChangeForm
              key={session}
              number={number}
              to={target}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

type StatusChangeFormProps = { number: string; to: OrderStatus; onDone: () => void }

function StatusChangeForm({ number, to, onDone }: StatusChangeFormProps) {
  const router = useRouter()
  const [tracking, setTracking] = useState("")
  const [state, action, pending] = useActionState<OrderActionResult | undefined, FormData>(
    async (_previous, formData) => {
      let result: OrderActionResult
      try {
        result = await changeOrderStatus(number, formData)
      } catch {
        result = { ok: false, message: GENERIC_MESSAGE }
      }
      if (result.ok) {
        notify.success("Order updated", { description: result.message })
        onDone()
      } else if (!result.errors) {
        // E.g. someone else changed the status meanwhile: show the order as it is now behind the dialog.
        router.refresh()
      }
      return result
    },
    undefined,
  )

  const failed = state && !state.ok ? state : undefined
  const fieldErrors = failed?.errors ?? {}
  const formError = failed && !fieldErrors.note && !fieldErrors.trackingNumber ? failed.message : undefined
  const destructive = DESTRUCTIVE.includes(to)
  const label = STATUS_ACTION_LABELS[to]
  const asErrors = (messages?: string[]) => messages?.map((message) => ({ message }))

  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{TITLES[to](number)}</DialogTitle>
        <DialogDescription>{DESCRIPTIONS[to]}</DialogDescription>
      </DialogHeader>

      <input type="hidden" name="status" value={to} />
      <FieldGroup className="gap-4">
        {to === "shipped" && (
          <Field data-invalid={fieldErrors.trackingNumber ? true : undefined}>
            <FieldLabel htmlFor="status-tracking">Tracking number</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="status-tracking"
                name="trackingNumber"
                value={tracking}
                onChange={(event) => setTracking(event.target.value)}
                maxLength={MAX_TRACKING_NUMBER_LENGTH}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                aria-invalid={fieldErrors.trackingNumber ? true : undefined}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton onClick={() => setTracking(generateTrackingNumber())}>
                  <Sparkles />
                  Generate
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>Optional. Letters, digits and dashes.</FieldDescription>
            <FieldError errors={asErrors(fieldErrors.trackingNumber)} />
          </Field>
        )}
        <Field data-invalid={fieldErrors.note ? true : undefined}>
          <FieldLabel htmlFor="status-note">Note (optional)</FieldLabel>
          <Textarea
            id="status-note"
            name="note"
            maxLength={MAX_NOTE_LENGTH}
            rows={3}
            placeholder={destructive ? "Why? The customer sees this note." : "Shown to the customer in the order history."}
            aria-invalid={fieldErrors.note ? true : undefined}
          />
          <FieldError errors={asErrors(fieldErrors.note)} />
        </Field>
      </FieldGroup>

      {formError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>Back</DialogClose>
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
          {pending && <Spinner data-icon="inline-start" aria-hidden />}
          {pending ? "Saving…" : label}
        </Button>
      </DialogFooter>
    </form>
  )
}
