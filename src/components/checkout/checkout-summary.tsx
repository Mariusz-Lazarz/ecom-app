import Image from "next/image"
import { ImageOff } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import type { Cart } from "@/lib/cart"
import { formatPrice } from "@/lib/catalogue"
import type { CheckoutQuote } from "@/lib/order-rules"
import { cn } from "@/lib/utils"

/** The checkout's order summary: each line with its thumbnail, then the quote's money rows. */
export function CheckoutSummary({ cart, quote }: { cart: Cart; quote: CheckoutQuote }) {
  const currency = cart.currency
  return (
    <div className="space-y-4">
      <ul aria-label="Items in your order" className="space-y-3">
        {cart.items.map((item) => (
          <li key={item.productId} className="flex items-center gap-3">
            <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
              {item.image ? (
                <Image
                  src={item.image.url}
                  alt={item.image.alt}
                  fill
                  sizes="56px"
                  className={cn("object-cover", !item.available && "opacity-50 grayscale")}
                />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageOff className="size-4" />
                </span>
              )}
              <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground/80 px-1 text-[10px] font-semibold text-background tabular-nums">
                {item.quantity}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {item.quantity} × {formatPrice(item.priceCents, item.currency)}
              </p>
            </div>
            <p
              className={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                !item.available && "text-muted-foreground line-through",
              )}
            >
              {formatPrice(item.lineTotalCents, item.currency)}
            </p>
          </li>
        ))}
      </ul>

      <Separator />

      <dl aria-label="Order totals" className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="font-medium tabular-nums">{formatPrice(quote.subtotalCents, currency)}</dd>
        </div>
        {quote.savingsCents > 0 && (
          <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
            <dt>You save</dt>
            <dd className="font-medium tabular-nums">−{formatPrice(quote.savingsCents, currency)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Shipping ({quote.shippingMethod.name})</dt>
          <dd className="font-medium tabular-nums">
            {quote.shippingCents === 0 ? "Free" : formatPrice(quote.shippingCents, currency)}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t pt-3 text-base">
          <dt className="font-semibold">Total</dt>
          <dd className="font-semibold tabular-nums">{formatPrice(quote.totalCents, currency)}</dd>
        </div>
      </dl>
    </div>
  )
}
