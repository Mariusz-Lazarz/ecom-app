import { formatPrice } from "@/lib/catalogue"
import type { OrderDetail } from "@/lib/orders"

type OrderTotalsProps = Pick<
  OrderDetail,
  "subtotalCents" | "savingsCents" | "shippingCents" | "totalCents" | "currency" | "shippingMethod"
>

/** Subtotal, savings, shipping and total as charged when the order was placed. */
export function OrderTotals({ subtotalCents, savingsCents, shippingCents, totalCents, currency, shippingMethod }: OrderTotalsProps) {
  return (
    <dl aria-label="Order totals" className="space-y-2 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="font-medium tabular-nums">{formatPrice(subtotalCents, currency)}</dd>
      </div>
      {savingsCents > 0 && (
        <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
          <dt>You saved</dt>
          <dd className="font-medium tabular-nums">−{formatPrice(savingsCents, currency)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Shipping ({shippingMethod.name})</dt>
        <dd className="font-medium tabular-nums">{shippingCents === 0 ? "Free" : formatPrice(shippingCents, currency)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t pt-3 text-base">
        <dt className="font-semibold">Total</dt>
        <dd className="font-semibold tabular-nums">{formatPrice(totalCents, currency)}</dd>
      </div>
    </dl>
  )
}
