import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { WishlistView } from "@/components/wishlist/wishlist-view"
import { requireUser } from "@/lib/auth-guards"
import { listWishlist } from "@/lib/wishlist"

export const metadata: Metadata = { title: "Your wishlist — Northcart" }

export default async function AccountWishlistPage() {
  const session = await requireUser("/account/wishlist")
  const items = await listWishlist(session.user.id)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/account"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Account
        </Link>
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">Your wishlist</h1>
        <WishlistView items={items} />
      </main>
      <SiteFooter />
    </>
  )
}
