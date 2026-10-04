import Link from "next/link"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { adminProductHref } from "@/lib/admin-product-list"
import type { DiscountCodeUsage, TopProduct } from "@/lib/analytics"
import { formatPrice } from "@/lib/catalogue"

const countFormat = new Intl.NumberFormat("en-US")

/** The best sellers: name (linking to the admin edit page unless deleted), units and sales. */
export function TopProductsTable({ products, label, currency }: { products: TopProduct[]; label: string; currency: string }) {
  if (products.length === 0) return <p className="py-4 text-sm text-muted-foreground">No products sold in this period.</p>

  return (
    <Table aria-label={label}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">#</TableHead>
          <TableHead>Product</TableHead>
          <TableHead className="text-right">Units</TableHead>
          <TableHead className="text-right">Sales</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product, index) => (
          <TableRow key={product.productId ?? `deleted-${product.name}`}>
            <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
            <TableCell className="max-w-56 whitespace-normal">
              {product.productId ? (
                <Link href={adminProductHref(product.productId)} className="font-medium hover:underline">
                  {product.name}
                </Link>
              ) : (
                <span className="font-medium">
                  {product.name} <span className="font-normal text-muted-foreground">(deleted)</span>
                </span>
              )}
              <span className="block text-xs text-muted-foreground">{product.brand}</span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{countFormat.format(product.units)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatPrice(product.revenueCents, currency)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** The discount codes that took most off orders in the period. */
export function DiscountCodesTable({ codes, currency }: { codes: DiscountCodeUsage[]; currency: string }) {
  if (codes.length === 0) return <p className="py-4 text-sm text-muted-foreground">No discount codes used in this period.</p>

  return (
    <Table aria-label="Top discount codes">
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead className="text-right">Orders</TableHead>
          <TableHead className="text-right">Discount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {codes.map((code) => (
          <TableRow key={code.code}>
            <TableCell className="font-mono font-medium">{code.code}</TableCell>
            <TableCell className="text-right tabular-nums">{countFormat.format(code.orders)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatPrice(code.discountCents, currency)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
