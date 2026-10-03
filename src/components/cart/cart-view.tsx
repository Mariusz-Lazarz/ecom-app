"use client"

import { useState } from "react"

import { CartLineItem } from "@/components/cart/cart-line-item"
import { CartEmpty, CartTotals, CheckoutButton } from "@/components/cart/cart-summary"
import { useOptimisticCart } from "@/components/cart/use-optimistic-cart"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Cart } from "@/lib/cart"

/** The /cart page body: the editable lines and the order summary, or the empty state. */
export function CartView({ cart }: { cart: Cart }) {
  const editor = useOptimisticCart(cart)
  const current = editor.cart
  const [confirming, setConfirming] = useState(false)

  if (current.items.length === 0) {
    return (
      <Card>
        <CardContent>
          <CartEmpty />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <section aria-labelledby="cart-items-heading">
        <div className="flex items-center justify-between gap-4 border-b pb-3">
          <h2 id="cart-items-heading" className="text-sm font-medium text-muted-foreground">
            {current.itemCount} {current.itemCount === 1 ? "item" : "items"}
          </h2>
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
              Clear cart
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear your cart?</AlertDialogTitle>
                <AlertDialogDescription>
                  {current.items.length === 1
                    ? "This removes the product from your cart."
                    : `This removes all ${current.items.length} products from your cart.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep shopping</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => {
                    setConfirming(false)
                    editor.clear()
                  }}>
                  Clear cart
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <ul aria-label="Cart items" className="divide-y">
          {current.items.map((item) => (
            <CartLineItem
              key={item.productId}
              item={item}
              onQuantityChange={editor.setQuantity}
              onRemove={editor.remove}
            />
          ))}
        </ul>
      </section>

      <Card className="lg:sticky lg:top-32">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Order summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CartTotals cart={current} />
          <CheckoutButton cart={current} />
        </CardContent>
      </Card>
    </div>
  )
}
