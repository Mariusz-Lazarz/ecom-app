import { discountPercent, formatPrice } from "@/lib/catalogue"
import { cn } from "@/lib/utils"

type PriceProps = {
  priceCents: number
  compareAtCents: number | null
  currency: string
  // "sm" is for compact lists such as search suggestions.
  size?: "sm" | "default" | "lg"
  className?: string
}

/** The current price, in red with the struck-through "was" price next to it when on sale. */
export function Price({ priceCents, compareAtCents, currency, size = "default", className }: PriceProps) {
  const discount = discountPercent(priceCents, compareAtCents)
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span
        className={cn(
          "font-semibold",
          { sm: "text-sm", default: "text-lg", lg: "text-3xl" }[size],
          discount !== null && "text-destructive",
        )}
      >
        {formatPrice(priceCents, currency)}
      </span>
      {discount !== null && (
        <>
          <span
            className={cn(
              "text-muted-foreground line-through",
              { sm: "text-xs", default: "text-sm", lg: "text-lg" }[size],
            )}
          >
            <span className="sr-only">Was </span>
            {formatPrice(compareAtCents!, currency)}
          </span>
          {size === "lg" && <span className="text-sm font-medium text-destructive">Save {discount}%</span>}
        </>
      )}
    </div>
  )
}
