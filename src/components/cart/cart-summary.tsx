"use client"

import Link from "next/link"
import { ShoppingCart, Truck } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { Cart } from "@/lib/cart"
import { freeShippingProgress } from "@/lib/cart-state"
import { formatPrice } from "@/lib/catalogue"

/** Subtotal, savings and shipping rows, followed by the progress towards free shipping. */
export function CartTotals({ cart }: { cart: Cart }) {
  const shipping = freeShippingProgress(cart.subtotalCents)
  const excluded = cart.items.some((item) => !item.available)

  return (
    <div className="space-y-4">
      <dl aria-label="Order summary" className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="font-semibold tabular-nums">{formatPrice(cart.subtotalCents, cart.currency)}</dd>
        </div>
        {cart.savingsCents > 0 && (
          <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
            <dt>You save</dt>
            <dd className="font-medium tabular-nums">−{formatPrice(cart.savingsCents, cart.currency)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Shipping</dt>
          <dd className="font-medium">{shipping.unlocked ? "Free" : "Calculated at checkout"}</dd>
        </div>
      </dl>
      {excluded && (
        <p className="text-xs text-muted-foreground">Out-of-stock items aren&apos;t included in the total.</p>
      )}
      <FreeShippingProgress subtotalCents={cart.subtotalCents} currency={cart.currency} />
    </div>
  )
}

export function FreeShippingProgress({ subtotalCents, currency }: { subtotalCents: number; currency: string }) {
  const { unlocked, remainingCents, percent } = freeShippingProgress(subtotalCents)
  return (
    <div className="space-y-2 rounded-lg bg-muted/60 p-3">
      <p className="flex items-center gap-2 text-xs font-medium">
        <Truck className="size-4 shrink-0" />
        {unlocked ? (
          "Free shipping unlocked"
        ) : (
          <span>
            <span className="tabular-nums">{formatPrice(remainingCents, currency)}</span> away from free shipping
          </span>
        )}
      </p>
      <Progress value={percent} aria-label="Progress to free shipping" />
    </div>
  )
}

/** Checkout isn't built yet, so its button stays disabled. */
export function CheckoutButton() {
  return (
    <Button size="lg" className="h-10 w-full" disabled>
      Checkout (coming soon)
    </Button>
  )
}

/** Shown in the mini-cart and on /cart when the cart has no lines. */
export function CartEmpty({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ShoppingCart className="size-6" />
      </span>
      <p className="text-lg font-semibold">Your cart is empty</p>
      <p className="max-w-xs text-sm text-muted-foreground">Find something you like and it&apos;ll show up here.</p>
      <Link href="/products" onClick={onNavigate} className={buttonVariants({ className: "mt-2" })}>
        Browse products
      </Link>
    </div>
  )
}
