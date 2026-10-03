"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useTransition } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

type SaleFilterProps = {
  checked: boolean
  // The catalogue URL with the sale filter flipped.
  toggleHref: string
}

/** The "On sale only" checkbox. Ticking or unticking it navigates to `toggleHref`. */
export function SaleFilter({ checked, toggleHref }: SaleFilterProps) {
  const router = useRouter()
  const [optimisticChecked, setOptimisticChecked] = useOptimistic(checked)
  const [, startTransition] = useTransition()

  return (
    <Label className="cursor-pointer py-1 font-normal">
      <Checkbox
        checked={optimisticChecked}
        onCheckedChange={(next) =>
          startTransition(() => {
            setOptimisticChecked(next)
            router.push(toggleHref)
          })
        }
      />
      On sale only
    </Label>
  )
}
