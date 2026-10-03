import type { Metadata } from "next"

import { WishlistView } from "@/components/wishlist/wishlist-view"
import { requireUser } from "@/lib/auth-guards"
import { listWishlist } from "@/lib/wishlist"

export const metadata: Metadata = { title: "Your wishlist — Northcart" }

export default async function AccountWishlistPage() {
  const session = await requireUser("/account/wishlist")
  const items = await listWishlist(session.user.id)

  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Your wishlist</h1>
      <WishlistView items={items} />
    </>
  )
}
