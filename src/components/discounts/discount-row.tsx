import { formatPrice } from "@/lib/catalogue"

/**
 * The "Discount (CODE)" line of a totals list (`<dl>`): what the code took off the subtotal, or
 * "Free shipping" for a code that waives shipping instead.
 */
export function DiscountRow({ code, discountCents, currency }: { code: string; discountCents: number; currency: string }) {
  return (
    <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
      <dt>Discount ({code})</dt>
      <dd className="font-medium tabular-nums">
        {discountCents > 0 ? `−${formatPrice(discountCents, currency)}` : "Free shipping"}
      </dd>
    </div>
  )
}
