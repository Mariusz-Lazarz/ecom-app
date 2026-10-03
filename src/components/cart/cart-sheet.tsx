"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { ShoppingBag } from "lucide-react"

import { CartLineItem } from "@/components/cart/cart-line-item"
import { CartEmpty, CartTotals, CheckoutButton } from "@/components/cart/cart-summary"
import { OPEN_MINI_CART_EVENT } from "@/components/cart/mini-cart-events"
import { useOptimisticCart } from "@/components/cart/use-optimistic-cart"
import { buttonVariants } from "@/components/ui/button"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import type { Cart } from "@/lib/cart"

export function cartLabel(count: number) {
  return `Cart, ${count} ${count === 1 ? "item" : "items"}`
}

/**
 * The header's cart icon and the mini-cart it opens. The badge count is server-rendered by the
 * header (`getCartCount()`), so it stays current through the cart actions' `refresh()`. The lines
 * are fetched from `GET /api/cart` each time the sheet opens and after each edit made in it,
 * which keeps the header render to one cheap query. Without JavaScript, or on a modified click
 * (new tab), the icon is a plain link to /cart.
 */
export function CartSheet({ count }: { count: number }) {
  const [open, setOpen] = useState(false)
  const [cart, setCart] = useState<Cart | null>(null)
  const [failed, setFailed] = useState(false)
  const triggerRef = useRef<HTMLAnchorElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cart", { cache: "no-store" })
      if (!res.ok) throw new Error(`GET /api/cart: ${res.status}`)
      const body: { cart: Cart } = await res.json()
      setCart(body.cart)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  const show = useCallback(() => {
    // A cart loaded earlier that no longer matches the badge would flash stale lines: show the skeleton instead.
    setCart((current) => (current && current.itemCount !== count ? null : current))
    setOpen(true)
    void load()
  }, [count, load])

  useEffect(() => {
    window.addEventListener(OPEN_MINI_CART_EVENT, show)
    return () => window.removeEventListener(OPEN_MINI_CART_EVENT, show)
  }, [show])

  const close = () => setOpen(false)

  return (
    <>
      <Link
        ref={triggerRef}
        href="/cart"
        aria-label={cartLabel(count)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={buttonVariants({ variant: "ghost", size: "icon", className: "relative" })}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          show()
        }}
      >
        <ShoppingBag />
        {count > 0 && (
          <span
            aria-hidden
            data-testid="cart-badge"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" finalFocus={triggerRef} className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle className="text-lg font-semibold">
              Your cart{cart && cart.itemCount > 0 ? ` (${cart.itemCount})` : ""}
            </SheetTitle>
          </SheetHeader>
          {cart ? (
            <MiniCartBody cart={cart} reload={load} onNavigate={close} />
          ) : failed ? (
            <p role="alert" className="p-4 text-sm text-muted-foreground">
              We couldn&apos;t load your cart.{" "}
              <Link href="/cart" onClick={close} className="font-medium text-foreground underline">
                Open the cart page
              </Link>
            </p>
          ) : (
            <div aria-label="Loading cart" className="space-y-4 p-4">
              {[0, 1].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-16 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function MiniCartBody({ cart, reload, onNavigate }: { cart: Cart; reload: () => Promise<void>; onNavigate: () => void }) {
  const editor = useOptimisticCart(cart, reload)

  if (editor.cart.items.length === 0) return <CartEmpty onNavigate={onNavigate} />

  return (
    <>
      <ul aria-label="Cart items" className="flex-1 divide-y overflow-y-auto px-4">
        {editor.cart.items.map((item) => (
          <CartLineItem
            key={item.productId}
            item={item}
            variant="compact"
            onQuantityChange={editor.setQuantity}
            onRemove={editor.remove}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
      <SheetFooter className="border-t bg-muted/30">
        <CartTotals cart={editor.cart} />
        <Link href="/cart" onClick={onNavigate} className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 w-full" })}>
          Go to cart
        </Link>
        <CheckoutButton />
      </SheetFooter>
    </>
  )
}
