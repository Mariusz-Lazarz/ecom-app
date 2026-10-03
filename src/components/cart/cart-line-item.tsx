"use client"

import Image from "next/image"
import Link from "next/link"
import { ImageOff, Trash2 } from "lucide-react"

import { QuantityStepper } from "@/components/cart/quantity-stepper"
import { Price } from "@/components/products/price"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CartItem } from "@/lib/cart"
import { lineLimit } from "@/lib/cart-state"
import { formatPrice } from "@/lib/catalogue"
import { cn } from "@/lib/utils"

type CartLineItemProps = {
  item: CartItem
  onQuantityChange: (productId: string, quantity: number) => void
  onRemove: (productId: string) => void
  // "compact" is the mini-cart row; "full" the /cart page row.
  variant?: "compact" | "full"
  // Called when a link to the product is followed, e.g. to close the mini-cart.
  onNavigate?: () => void
}

/** One cart line: photo, name, price, quantity stepper, line total and remove, plus stock warnings. */
export function CartLineItem({ item, onQuantityChange, onRemove, variant = "full", onNavigate }: CartLineItemProps) {
  const href = `/products/${item.slug}`
  const compact = variant === "compact"
  const limit = lineLimit(item.stock)

  return (
    <li
      data-testid="cart-line"
      data-product-id={item.productId}
      className={cn("flex gap-3 sm:gap-4", compact ? "py-3" : "py-5")}
    >
      <Link
        href={href}
        onClick={onNavigate}
        aria-hidden
        tabIndex={-1}
        className={cn(
          "relative shrink-0 overflow-hidden rounded-lg bg-muted",
          compact ? "size-16" : "size-20 sm:size-24",
        )}
      >
        {item.image ? (
          <Image
            src={item.image.url}
            alt={item.image.alt}
            fill
            sizes={compact ? "64px" : "96px"}
            className={cn("object-cover", !item.available && "opacity-50 grayscale")}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-5" />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            {!compact && <p className="text-xs text-muted-foreground">{item.brand}</p>}
            <Link
              href={href}
              onClick={onNavigate}
              className={cn("line-clamp-2 font-medium hover:underline", compact && "text-sm")}
            >
              {item.name}
            </Link>
            <Price
              priceCents={item.priceCents}
              compareAtCents={item.onSale ? item.compareAtCents : null}
              currency={item.currency}
              size="sm"
            />
          </div>
          <p
            className={cn(
              "shrink-0 font-semibold tabular-nums",
              compact ? "text-sm" : "text-base",
              !item.available && "text-muted-foreground line-through",
            )}
          >
            {!item.available && <span className="sr-only">Not counted: </span>}
            {formatPrice(item.lineTotalCents, item.currency)}
          </p>
        </div>

        {!item.available && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="destructive">Out of stock</Badge>
            <span className="text-muted-foreground">Not included in your total.</span>
          </div>
        )}
        {item.limited && (
          <div className="flex flex-wrap items-center gap-x-2 text-xs">
            <span className="font-medium text-amber-600 dark:text-amber-400">Only {item.stock} left</span>
            <Button
              variant="link"
              size="xs"
              className="h-auto px-0"
              onClick={() => onQuantityChange(item.productId, limit)}
            >
              Reduce to {limit}
            </Button>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2">
          <QuantityStepper
            value={item.quantity}
            max={limit}
            onValueChange={(quantity) => onQuantityChange(item.productId, quantity)}
            productName={item.name}
            disabled={!item.available}
            size="sm"
          />
          <Button
            variant="ghost"
            size={compact ? "icon-sm" : "sm"}
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${item.name}`}
            onClick={() => onRemove(item.productId)}
          >
            <Trash2 />
            {!compact && <span className="hidden sm:inline">Remove</span>}
          </Button>
        </div>
      </div>
    </li>
  )
}
