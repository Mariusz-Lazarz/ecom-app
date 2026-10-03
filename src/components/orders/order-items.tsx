import Image from "next/image"
import Link from "next/link"
import { ImageOff } from "lucide-react"

import { formatPrice } from "@/lib/catalogue"
import type { OrderItem } from "@/lib/orders"

/** The order's lines as bought (snapshot name, brand, photo and price), each linking to its product page. */
export function OrderItems({ items, currency }: { items: OrderItem[]; currency: string }) {
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
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatPrice(item.lineTotalCents, currency)}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
