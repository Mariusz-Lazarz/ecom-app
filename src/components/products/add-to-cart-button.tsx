"use client"

import { Plus, ShoppingBag } from "lucide-react"

import { Button } from "@/components/ui/button"
import { notify } from "@/lib/notify"

type AddToCartButtonProps = {
  productName: string
  inStock: boolean
  // "icon" is the compact button on product cards; "full" is the labelled one on the product page.
  variant?: "icon" | "full"
}

/** The cart isn't built yet, so this only says so. Disabled when the product is out of stock. */
export function AddToCartButton({ productName, inStock, variant = "icon" }: AddToCartButtonProps) {
  const onClick = () => notify.info("Cart coming soon", { description: "Checkout isn't open yet." })

  if (variant === "icon") {
    return (
      <Button
        size="icon"
        variant="outline"
        disabled={!inStock}
        aria-label={inStock ? `Add ${productName} to cart` : `${productName} is out of stock`}
        onClick={onClick}
      >
        <Plus />
      </Button>
    )
  }

  return (
    <Button size="lg" className="h-11 w-full px-6 sm:w-auto" disabled={!inStock} onClick={onClick}>
      <ShoppingBag />
      {inStock ? "Add to cart" : "Out of stock"}
    </Button>
  )
}
