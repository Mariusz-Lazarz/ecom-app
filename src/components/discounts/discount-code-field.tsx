"use client"

import { useId, useState, useTransition } from "react"
import { TicketPercent, X } from "lucide-react"

import { applyDiscountCode, removeDiscountCode } from "@/app/actions/cart"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { GENERIC_MESSAGE } from "@/lib/errors"
import { notify } from "@/lib/notify"
import { describeDiscount, type DiscountRule } from "@/lib/order-rules"

/**
 * The checkout's discount code field. Without a code it's an input with "Apply"; with one it shows
 * the code, what it does and a remove button. Both call cart Server Actions, which store the code
 * in the cart and re-render the page, so the totals pick it up. It sits inside the checkout form
 * but posts nothing with it: the input has no `name`, and Enter applies the code instead of
 * placing the order.
 */
export function DiscountCodeField({ applied, currency }: { applied: DiscountRule | null; currency: string }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const id = useId()
  const errorId = `${id}-error`

  function apply() {
    if (pending) return
    startTransition(async () => {
      const result = await applyDiscountCode(code).catch(() => ({ ok: false, message: GENERIC_MESSAGE, code: undefined }))
      if (!result.ok) {
        setError(result.message ?? GENERIC_MESSAGE)
        return
      }
      setError(null)
      setCode("")
      notify.success(`${result.code} applied`)
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await removeDiscountCode().catch(() => ({ ok: false, message: GENERIC_MESSAGE }))
      if (!result.ok) notify.error("Couldn't remove the code", { description: result.message })
    })
  }

  if (applied) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-emerald-600/40 bg-emerald-50 px-3 py-2 dark:border-emerald-400/30 dark:bg-emerald-950/40">
        <TicketPercent aria-hidden className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold tracking-wide">{applied.code}</span>
          <span className="text-muted-foreground"> · {describeDiscount(applied, currency)}</span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={remove}
          disabled={pending}
          aria-label={`Remove discount code ${applied.code}`}
        >
          {pending ? <Spinner aria-hidden /> : <X />}
        </Button>
      </div>
    )
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>Discount code</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          value={code}
          onChange={(event) => {
            setCode(event.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            if (code.trim()) apply()
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. WELCOME10"
          className="uppercase placeholder:normal-case"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="button" variant="secondary" size="sm" onClick={apply} disabled={pending || !code.trim()}>
            {pending && <Spinner data-icon="inline-start" aria-hidden />}
            Apply
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  )
}
