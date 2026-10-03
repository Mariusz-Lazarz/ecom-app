import Image from "next/image"
import Link from "next/link"
import { ChevronRight, CircleCheck, ImageOff } from "lucide-react"

import { StockBadge } from "@/components/admin/stock-badge"
import { adminProductHref } from "@/lib/admin-product-list"
import type { AdminProductSummary } from "@/lib/admin-products"

/** The products closest to running out, each linking to its edit page; or an all-clear note. */
export function LowStockProducts({ products }: { products: AdminProductSummary[] }) {
  if (products.length === 0) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
        Every product is well stocked.
      </p>
    )
  }

  return (
    <ul aria-label="Low stock products" className="divide-y">
      {products.map((product) => (
        <li key={product.id}>
          <Link
            href={adminProductHref(product.id)}
            className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/50"
          >
            <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
              {product.image ? (
                <Image src={product.image.url} alt="" fill sizes="40px" className="object-cover" />
              ) : (
                <ImageOff aria-hidden className="size-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{product.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {product.brand} · {product.category.name}
              </span>
            </span>
            <StockBadge stock={product.stock} />
            <ChevronRight aria-hidden className="hidden size-4 text-muted-foreground sm:block" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
