"use client"

import { useId, useState } from "react"

import { payLater, splitIntoInstalments } from "@/lib/payments"

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export function InstalmentCalculator({ initialTotal = 240 }: { initialTotal?: number }) {
  const [total, setTotal] = useState(initialTotal)
  const inputId = useId()

  return (
    <div className="space-y-6 rounded-2xl bg-background p-6 ring-1 ring-foreground/10 sm:p-8">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor={inputId} className="text-sm font-medium">
            Order total
          </label>
          <output htmlFor={inputId} className="text-2xl font-semibold tabular-nums">
            {usd.format(total)}
          </output>
        </div>
        <input
          id={inputId}
          type="range"
          min={payLater.minTotal}
          max={payLater.maxTotal}
          step={10}
          value={total}
          onChange={(e) => setTotal(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{usd.format(payLater.minTotal)}</span>
          <span>{usd.format(payLater.maxTotal)}</span>
        </div>
      </div>

      <ol aria-label="Payment schedule" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {splitIntoInstalments(total).map((instalment, i) => (
          <li key={instalment.label} className="rounded-xl bg-muted/60 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
              >
                {i + 1}
              </span>
              {instalment.label}
            </div>
            <p className="mt-2 text-lg font-semibold tabular-nums">{usd.format(instalment.amount)}</p>
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted-foreground">
        0% interest, no sign-up fee. Subject to a quick eligibility check at checkout.
      </p>
    </div>
  )
}
