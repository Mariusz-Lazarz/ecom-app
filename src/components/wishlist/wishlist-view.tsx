"use client"

import Image from "next/image"
import Link from "next/link"
import { useOptimistic, useTransition } from "react"
import { Heart, ImageOff, ShoppingBag, Trash2 } from "lucide-react"

import {
  addAllWishlistToCart,
  moveWishlistItemToCart,
  removeWishlistItem,
  type AddAllToCartResult,
  type WishlistActionResult,
} from "@/app/actions/wishlist"
import { openMiniCart } from "@/components/cart/mini-cart-events"
import { Price } from "@/components/products/price"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { GENERIC_MESSAGE } from "@/lib/errors"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"
import type { WishlistItem } from "@/lib/wishlist"

// Shown as "Only N left" at or below this stock level, as on the product page.
const LOW_STOCK = 10

const viewCart = { label: "View cart", onClick: openMiniCart }

async function safely<T extends WishlistActionResult>(action: () => Promise<T>): Promise<T | WishlistActionResult> {
  try {
    return await action()
  } catch {
    return { ok: false, message: GENERIC_MESSAGE }
  }
}

/**
 * The /account/wishlist grid. Removing or moving an item hides it at once (optimistically); the
 * Server Action's `refresh()` then brings back the new list, and a failure puts the item back
 * with a toast.
 */
export function WishlistView({ items }: { items: WishlistItem[] }) {
  const [visible, hide] = useOptimistic(items, (current, productId: string) =>
    current.filter((item) => item.productId !== productId),
  )
  const [addingAll, startAddAll] = useTransition()
  const available = visible.filter((item) => item.inStock).length

  if (visible.length === 0) return <WishlistEmpty />

  function addAll() {
    startAddAll(async () => {
      const result: AddAllToCartResult = await safely(addAllWishlistToCart)
      if (!result.ok) {
        notify.error("Couldn't add to cart", { description: result.message })
        return
      }
      const added = result.added ?? 0
      const skipped = result.skipped ?? 0
      notify.success(`${added} ${added === 1 ? "item" : "items"} added to cart`, {
        description: skipped > 0 ? `${skipped} out of stock ${skipped === 1 ? "was" : "were"} skipped.` : undefined,
        action: viewCart,
      })
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" role="status">
          {visible.length} saved {visible.length === 1 ? "item" : "items"}
          {available < visible.length && ` · ${visible.length - available} out of stock`}
        </p>
        <Button onClick={addAll} disabled={available === 0 || addingAll} aria-busy={addingAll || undefined}>
          {addingAll ? <Spinner aria-hidden /> : <ShoppingBag />}
          Add all available to cart
        </Button>
      </div>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((item) => (
          <li key={item.productId} className="grid">
            <WishlistCard item={item} onGone={hide} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function WishlistCard({ item, onGone }: { item: WishlistItem; onGone: (productId: string) => void }) {
  const [pending, startTransition] = useTransition()
  const href = `/products/${item.slug}`

  function move() {
    startTransition(async () => {
      onGone(item.productId)
      const result = await safely(() => moveWishlistItemToCart({ productId: item.productId }))
      if (!result.ok) {
        notify.error("Couldn't move to cart", { description: result.message })
        return
      }
      if (result.message) notify.warning(result.message, { description: item.name, action: viewCart })
      else notify.success("Moved to cart", { description: item.name, action: viewCart })
    })
  }

  function remove() {
    startTransition(async () => {
      onGone(item.productId)
      const result = await safely(() => removeWishlistItem({ productId: item.productId }))
      if (!result.ok) notify.error("Couldn't remove this item", { description: result.message })
      else notify.info("Removed from your wishlist", { description: item.name })
    })
  }

  return (
    <Card className="relative gap-0 py-0" aria-busy={pending || undefined}>
      <Link href={href} aria-hidden tabIndex={-1} className="relative block aspect-square overflow-hidden bg-muted">
        {item.image ? (
          <Image
            src={item.image.url}
            alt={item.image.alt}
            fill
            sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className={cn("object-cover", !item.inStock && "opacity-60 grayscale")}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" />
          </span>
        )}
      </Link>
      {!item.inStock && (
        <Badge variant="secondary" className="absolute top-3 left-3">
          Out of stock
        </Badge>
      )}
      <CardContent className="flex flex-1 flex-col gap-2 py-4">
        <p className="text-xs text-muted-foreground">{item.brand}</p>
        <Link href={href} className="font-medium hover:underline">
          {item.name}
        </Link>
        <Price
          priceCents={item.priceCents}
          compareAtCents={item.onSale ? item.compareAtCents : null}
          currency={item.currency}
        />
        {item.inStock && item.stock <= LOW_STOCK && (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Only {item.stock} left</p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <Button className="flex-1" disabled={!item.inStock || pending} onClick={move}>
            {pending ? <Spinner aria-hidden /> : <ShoppingBag />}
            {item.inStock ? "Move to cart" : "Out of stock"}
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={pending}
            aria-label={`Remove ${item.name} from wishlist`}
            onClick={remove}
          >
            <Trash2 />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function WishlistEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Heart className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">Your wishlist is empty</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        Tap the heart on any product to save it here for later.
      </p>
      <Link href="/products" className={buttonVariants({ className: "mt-2" })}>
        Browse products
      </Link>
    </div>
  )
}
