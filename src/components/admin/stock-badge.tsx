import { Badge } from "@/components/ui/badge"
import { LOW_STOCK_THRESHOLD } from "@/lib/validation/admin-products"

/** The stock count, flagged "Out" at 0 and "Low" at or below LOW_STOCK_THRESHOLD. */
export function StockBadge({ stock }: { stock: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums">{stock}</span>
      {stock === 0 ? (
        <Badge variant="destructive">Out</Badge>
      ) : stock <= LOW_STOCK_THRESHOLD ? (
        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          Low
        </Badge>
      ) : null}
    </span>
  )
}
