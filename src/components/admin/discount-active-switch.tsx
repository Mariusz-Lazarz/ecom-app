"use client"

import { useOptimistic, useTransition } from "react"

import { setDiscountCodeActive } from "@/app/actions/admin-discounts"
import { Switch } from "@/components/ui/switch"
import { GENERIC_MESSAGE } from "@/lib/errors"
import { notify } from "@/lib/notify"

/**
 * Turns a discount code on or off in place. The switch flips at once and falls back to the stored
 * state (with an error toast) when the `setDiscountCodeActive` Server Action fails.
 */
export function DiscountActiveSwitch({ id, code, active }: { id: string; code: string; active: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(active)
  const [, startTransition] = useTransition()

  return (
    <Switch
      checked={optimistic}
      aria-label={`${code} active`}
      onCheckedChange={(next) => {
        startTransition(async () => {
          setOptimistic(next)
          const result = await setDiscountCodeActive(id, next).catch(() => ({ ok: false, message: GENERIC_MESSAGE }))
          if (!result.ok) notify.error("Couldn't update the code", { description: result.message })
          else notify.success(result.message ?? "Saved")
        })
      }}
      className="relative z-10"
    />
  )
}
