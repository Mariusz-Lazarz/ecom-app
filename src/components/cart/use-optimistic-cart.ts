"use client"

import { useOptimistic, useTransition } from "react"

import { clearCart, removeCartItem, updateCartItem, type CartActionResult } from "@/app/actions/cart"
import type { Cart } from "@/lib/cart"
import { applyCartChange, type CartChange } from "@/lib/cart-state"
import { GENERIC_MESSAGE } from "@/lib/errors"
import { notify } from "@/lib/notify"

/**
 * Cart edits that show up instantly. Each one applies its change to the cart on screen through
 * `useOptimistic`, then runs the Server Action in a transition. When the transition ends the cart
 * falls back to the `cart` prop: the fresh one on success (the action's `refresh()`, or
 * `afterChange` for carts loaded on the client), the unchanged one on failure, which is the
 * rollback; failures also show an error toast.
 */
export function useOptimisticCart(cart: Cart, afterChange?: () => Promise<void>) {
  const [optimisticCart, apply] = useOptimistic(cart, applyCartChange)
  const [isPending, startTransition] = useTransition()

  function run(change: CartChange, action: () => Promise<CartActionResult>) {
    startTransition(async () => {
      apply(change)
      let result: CartActionResult
      try {
        result = await action()
      } catch {
        result = { ok: false, message: GENERIC_MESSAGE }
      }
      if (!result.ok) {
        notify.error("Couldn't update your cart", { description: result.message })
        return
      }
      if (result.message) notify.warning(result.message)
      await afterChange?.()
    })
  }

  return {
    cart: optimisticCart,
    isPending,
    setQuantity: (productId: string, quantity: number) =>
      run({ type: "quantity", productId, quantity }, () => updateCartItem({ productId, quantity })),
    remove: (productId: string) => run({ type: "remove", productId }, () => removeCartItem({ productId })),
    clear: () => run({ type: "clear" }, () => clearCart()),
  }
}

export type CartEditor = ReturnType<typeof useOptimisticCart>
