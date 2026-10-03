"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useTransition } from "react"
import { Heart } from "lucide-react"

import { toggleWishlistItem, type WishlistActionResult } from "@/app/actions/wishlist"
import { Toggle } from "@/components/ui/toggle"
import { GENERIC_MESSAGE } from "@/lib/errors"
import { notify } from "@/lib/notify"
import { loginHref } from "@/lib/safe-redirect"
import { cn } from "@/lib/utils"

type WishlistButtonProps = {
  productId: string
  productName: string
  // Whether the product is saved, as the server rendered it.
  saved: boolean
  // Guests are sent to /login (and back to this page) instead.
  signedIn: boolean
  // "overlay" is the round button over a product card's photo; "full" sits next to Add to cart.
  variant?: "overlay" | "full"
  className?: string
}

/**
 * The heart that saves a product to the wishlist. It flips at once (optimistically) and calls the
 * `toggleWishlistItem` Server Action, whose `refresh()` brings back the new `saved` prop. A failure
 * rolls the heart back, because the optimistic value only lasts while the action runs, and shows a
 * toast.
 */
export function WishlistButton({
  productId,
  productName,
  saved,
  signedIn,
  variant = "overlay",
  className,
}: WishlistButtonProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [optimisticSaved, setOptimisticSaved] = useOptimistic(saved)

  function toggle() {
    if (!signedIn) {
      notify.info("Sign in to save items", { description: productName })
      router.push(loginHref(window.location.pathname + window.location.search))
      return
    }
    const next = !optimisticSaved
    startTransition(async () => {
      setOptimisticSaved(next)
      let result: WishlistActionResult
      try {
        result = await toggleWishlistItem({ productId })
      } catch {
        result = { ok: false, message: GENERIC_MESSAGE }
      }
      if (result.signedOut) {
        notify.info("Sign in to save items", { description: productName })
        router.push(loginHref(window.location.pathname + window.location.search))
        return
      }
      if (!result.ok) {
        notify.error(next ? "Couldn't save this item" : "Couldn't remove this item", { description: result.message })
        return
      }
      if (result.saved) notify.success("Saved to your wishlist", { description: productName })
      else notify.info("Removed from your wishlist", { description: productName })
    })
  }

  const label = optimisticSaved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`

  return (
    <Toggle
      variant="outline"
      size={variant === "full" ? "lg" : "default"}
      pressed={optimisticSaved}
      onPressedChange={toggle}
      aria-label={label}
      aria-busy={pending || undefined}
      data-saved={optimisticSaved || undefined}
      className={cn(
        "bg-background aria-pressed:bg-background aria-pressed:hover:bg-muted",
        variant === "overlay" && "size-9 rounded-full border-transparent bg-background/80 shadow-sm backdrop-blur",
        variant === "full" && "size-11",
        className,
      )}
    >
      <Heart
        className={cn(
          variant === "full" ? "size-5" : "size-4",
          "transition-colors",
          optimisticSaved && "fill-rose-500 text-rose-500",
        )}
      />
    </Toggle>
  )
}
