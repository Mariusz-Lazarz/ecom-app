import Image from "next/image"
import Link from "next/link"
import { ImageOff, PenLine, Star } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { formatPrice } from "@/lib/catalogue"
import type { OrderItem } from "@/lib/orders"
import { reviewFormHref } from "@/lib/review-utils"

/** Whether the customer has reviewed each product (by product id), for a delivered order. */
export type ItemReviewStates = Record<string, "write" | "edit">

type OrderItemsProps = {
  items: OrderItem[]
  currency: string
  // Only for delivered orders: adds "Write a review" / "Edit your review" to lines whose product still exists.
  reviews?: ItemReviewStates
}

/**
 * The order's lines as bought (snapshot name, brand, photo and price), each linking to its product
 * page, and with `reviews`, to the product page's review form.
 */
export function OrderItems({ items, currency, reviews }: OrderItemsProps) {
  return (
    <ul aria-label="Items" className="divide-y">
      {items.map((item) => {
        const href = `/products/${item.slug}`
        return (
          <li key={item.id} className="flex gap-3 py-4 first:pt-0 last:pb-0 sm:gap-4">
            <Link
              href={href}
              aria-hidden
              tabIndex={-1}
              className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-20"
            >
              {item.image ? (
                <Image src={item.image.url} alt={item.image.alt} fill sizes="80px" className="object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageOff className="size-5" />
                </span>
              )}
            </Link>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs text-muted-foreground">{item.brand}</p>
                <Link href={href} className="line-clamp-2 font-medium hover:underline">
                  {item.name}
                </Link>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {item.quantity} × {formatPrice(item.unitPriceCents, currency)}
                  {item.compareAtCents !== null && item.compareAtCents > item.unitPriceCents && (
                    <span className="ml-1.5 line-through">{formatPrice(item.compareAtCents, currency)}</span>
                  )}
                </p>
                {reviews && item.productId && reviews[item.productId] && (
                  <Link
                    href={reviewFormHref(item.slug)}
                    className={buttonVariants({ variant: "outline", size: "sm", className: "mt-2" })}
                  >
                    {reviews[item.productId] === "edit" ? (
                      <PenLine data-icon="inline-start" />
                    ) : (
                      <Star data-icon="inline-start" />
                    )}
                    {reviews[item.productId] === "edit" ? "Edit your review" : "Write a review"}{" "}
                    <span className="sr-only">of {item.name}</span>
                  </Link>
                )}
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatPrice(item.lineTotalCents, currency)}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
