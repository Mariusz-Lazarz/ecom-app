"use client"

import { useState, useTransition } from "react"
import { Plus, ShoppingBag } from "lucide-react"

import { addToCart } from "@/app/actions/cart"
import { openMiniCart } from "@/components/cart/mini-cart-events"
import { QuantityStepper } from "@/components/cart/quantity-stepper"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { lineLimit } from "@/lib/cart-state"
import { GENERIC_MESSAGE } from "@/lib/errors"
import { notify } from "@/lib/notify"

type AddToCartButtonProps = {
  productId: string
  productName: string
  inStock: boolean
  // "icon" is the compact quick add (one unit) on product cards; "full" is the product page's
  // quantity stepper plus labelled button, which needs `stock` to bound the stepper.
  variant?: "icon" | "full"
  stock?: number
}

/**
 * Adds the product to the cart through the `addToCart` Server Action, which re-renders the header
 * badge. Shows a toast with a "View cart" action that opens the mini-cart; a capped add shows the
 * action's note instead. Disabled when the product is out of stock.
 */
export function AddToCartButton({ productId, productName, inStock, variant = "icon", stock = 0 }: AddToCartButtonProps) {
  const [quantity, setQuantity] = useState(1)
  const [pending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      let result
      try {
        result = await addToCart({ productId, quantity: variant === "full" ? quantity : 1 })
      } catch {
        result = { ok: false, message: GENERIC_MESSAGE }
      }
      if (!result.ok) {
        notify.error("Couldn't add to cart", { description: result.message })
        return
      }
      const action = { label: "View cart", onClick: openMiniCart }
      if (result.message) notify.warning(result.message, { description: productName, action })
      else notify.success("Added to cart", { description: productName, action })
    })
  }

  if (variant === "icon") {
    return (
      <Button
        size="icon"
        variant="outline"
        disabled={!inStock || pending}
        aria-busy={pending || undefined}
        aria-label={inStock ? `Add ${productName} to cart` : `${productName} is out of stock`}
        onClick={add}
      >
        {pending ? <Spinner aria-hidden /> : <Plus />}
      </Button>
    )
  }

  const limit = lineLimit(stock)
  return (
    <div className="flex flex-wrap items-center gap-3">
      {inStock && limit > 0 && (
        <QuantityStepper value={Math.min(quantity, limit)} max={limit} onValueChange={setQuantity} disabled={pending} />
      )}
      <Button
        size="lg"
        className="h-11 flex-1 px-6 sm:flex-none"
        disabled={!inStock || pending}
        aria-busy={pending || undefined}
        onClick={add}
      >
        {pending ? <Spinner aria-hidden /> : <ShoppingBag />}
        {inStock ? "Add to cart" : "Out of stock"}
      </Button>
    </div>
  )
}
