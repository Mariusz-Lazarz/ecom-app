"use client"

import { useState } from "react"
import { Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type QuantityStepperProps = {
  value: number
  // Upper bound, usually lineLimit(stock). A value above it (stock dropped) can only go down.
  max: number
  min?: number
  // Called with a whole number in [min, max]: on −/+ and when a typed value is committed (blur or Enter).
  onValueChange: (value: number) => void
  // Names the product in the controls' labels, for lists with several steppers.
  productName?: string
  disabled?: boolean
  size?: "sm" | "default"
  className?: string
}

/**
 * A −/+ stepper around a typeable quantity. Typing doesn't call `onValueChange` on each keystroke:
 * the value is committed on blur or Enter, clamped to [min, max]; anything unparsable is reverted.
 */
export function QuantityStepper({
  value,
  max,
  min = 1,
  onValueChange,
  productName,
  disabled = false,
  size = "default",
  className,
}: QuantityStepperProps) {
  const [draft, setDraft] = useState(String(value))
  const [shown, setShown] = useState(value)
  // A new value from outside (server response, rollback) replaces whatever is in the input.
  if (shown !== value) {
    setShown(value)
    setDraft(String(value))
  }

  const of = productName ? ` of ${productName}` : ""
  const blocked = disabled || max < min

  function commit(next: number) {
    const clamped = Math.min(Math.max(next, min), Math.max(max, min))
    setDraft(String(clamped))
    if (clamped !== value) onValueChange(clamped)
  }

  function commitDraft() {
    const parsed = Number.parseInt(draft, 10)
    if (Number.isNaN(parsed)) setDraft(String(value))
    else commit(parsed)
  }

  const buttonSize = size === "sm" ? "icon-sm" : "icon-lg"

  return (
    <ButtonGroup aria-label={`Quantity${of}`} className={className}>
      <Button
        type="button"
        variant="outline"
        size={buttonSize}
        aria-label={`Decrease quantity${of}`}
        disabled={blocked || value <= min}
        // Above the limit (stock dropped), one step down goes straight to the limit.
        onClick={() => commit(Math.min(value - 1, max))}
      >
        <Minus />
      </Button>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`Quantity${of}`}
        value={draft}
        disabled={blocked}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 2))}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commitDraft()
          }
        }}
        className={cn("text-center tabular-nums", size === "sm" ? "h-7 w-10" : "h-9 w-12")}
      />
      <Button
        type="button"
        variant="outline"
        size={buttonSize}
        aria-label={`Increase quantity${of}`}
        disabled={blocked || value >= max}
        onClick={() => commit(value + 1)}
      >
        <Plus />
      </Button>
    </ButtonGroup>
  )
}
