import Image from "next/image"
import Link from "next/link"
import { ImageOff, Star } from "lucide-react"

import { StockBadge } from "@/components/admin/stock-badge"
import { Price } from "@/components/products/price"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { adminProductHref } from "@/lib/admin-product-list"
import type { AdminProductSummary } from "@/lib/admin-products"

/**
 * The admin product list as a table (it scrolls sideways inside its container on small screens).
 * The name links to the product's edit page and its hit area covers the whole row.
 */
export function AdminProductTable({ products }: { products: AdminProductSummary[] }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table aria-label="Products" className="min-w-[52rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-16 pl-4">
              <span className="sr-only">Image</span>
            </TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Featured</TableHead>
            <TableHead className="pr-4">Badge</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id} className="relative">
              <TableCell className="pl-4">
                <span className="relative flex size-11 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
                  {product.image ? (
                    <Image src={product.image.url} alt="" fill sizes="44px" className="object-cover" />
                  ) : (
                    <ImageOff aria-hidden className="size-4" />
                  )}
                </span>
              </TableCell>
              <TableCell className="max-w-72">
                <Link
                  href={adminProductHref(product.id)}
                  className="block truncate font-medium before:absolute before:inset-0 hover:underline focus-visible:outline-none focus-visible:before:ring-2 focus-visible:before:ring-ring focus-visible:before:ring-inset"
                >
                  {product.name}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">{product.brand}</span>
              </TableCell>
              <TableCell className="text-muted-foreground">{product.category.name}</TableCell>
              <TableCell className="text-right">
                <Price
                  priceCents={product.priceCents}
                  compareAtCents={product.compareAtCents}
                  currency={product.currency}
                  size="sm"
                  className="justify-end"
                />
              </TableCell>
              <TableCell>
                <StockBadge stock={product.stock} />
              </TableCell>
              <TableCell>
                {product.featured ? (
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Star aria-hidden className="size-3.5 fill-amber-400 text-amber-400" />
                    Yes
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">No</span>
                )}
              </TableCell>
              <TableCell className="pr-4">
                {product.badge ? <Badge variant="secondary">{product.badge}</Badge> : <span aria-hidden>—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
