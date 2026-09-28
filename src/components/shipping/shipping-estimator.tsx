"use client"

import { useId, useState } from "react"

import { cn } from "@/lib/utils"
import {
  amountToFreeShipping,
  formatDeliveryWindow,
  shippingCost,
  shippingMethods,
  shippingRules,
} from "@/lib/shipping"

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

const maxSubtotal = 150

export function ShippingEstimator({
  initialSubtotal = 35,
  initialMethodId = "standard",
}: {
  initialSubtotal?: number
  initialMethodId?: string
}) {
  const [subtotal, setSubtotal] = useState(initialSubtotal)
  const [methodId, setMethodId] = useState(initialMethodId)
  const inputId = useId()

  const method = shippingMethods.find((m) => m.id === methodId) ?? shippingMethods[0]
  const cost = shippingCost(subtotal, method)
  const remaining = amountToFreeShipping(subtotal)

  return (
    <div className="space-y-6 rounded-2xl bg-background p-6 ring-1 ring-foreground/10 sm:p-8">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor={inputId} className="text-sm font-medium">
            Order subtotal
          </label>
          <output htmlFor={inputId} className="text-2xl font-semibold tabular-nums">
            {usd.format(subtotal)}
          </output>
        </div>
        <input
          id={inputId}
          type="range"
          min={0}
          max={maxSubtotal}
          step={5}
          value={subtotal}
          onChange={(e) => setSubtotal(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Delivery method</legend>
        <div className="grid grid-cols-2 gap-2">
          {shippingMethods.map((m) => (
            <label
              key={m.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-foreground/10 transition-colors",
                m.id === method.id ? "bg-muted font-medium ring-foreground/30" : "hover:bg-muted/60"
              )}
            >
              <input
                type="radio"
                name="delivery-method"
                value={m.id}
                checked={m.id === method.id}
                onChange={() => setMethodId(m.id)}
                className="accent-primary"
              />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>

      <dl aria-label="Estimate" className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/60 p-3">
          <dt className="text-xs text-muted-foreground">Shipping</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{cost === 0 ? "Free" : usd.format(cost)}</dd>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <dt className="text-xs text-muted-foreground">Arrives in</dt>
          <dd className="mt-1 text-lg font-semibold">{formatDeliveryWindow(method)}</dd>
        </div>
      </dl>

      <div className="space-y-2">
        <progress
          aria-label="Progress to free shipping"
          max={shippingRules.freeThreshold}
          value={Math.min(subtotal, shippingRules.freeThreshold)}
          className="h-2 w-full overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
        />
        <p className="text-xs text-muted-foreground">
          {remaining > 0
            ? `Add ${usd.format(remaining)} more for free standard shipping.`
            : "You've unlocked free standard shipping."}
        </p>
      </div>
    </div>
  )
}
