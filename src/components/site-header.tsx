import Link from "next/link"
import { unstable_rethrow } from "next/navigation"
import { LayoutDashboard, ShoppingBag, User } from "lucide-react"

import { auth } from "@/auth"
import { CartSheet } from "@/components/cart/cart-sheet"
import { HeaderSearch } from "@/components/header-search"
import { MobileNav } from "@/components/mobile-nav"
import { buttonVariants } from "@/components/ui/button"
import { getCartCount } from "@/lib/cart"
import { navLinks, siteConfig } from "@/lib/data"
import { logError } from "@/lib/errors"
import { shippingRules } from "@/lib/shipping"

// The badge must not take the page down with it: without a count the header shows an empty cart.
async function cartCount() {
  try {
    return await getCartCount()
  } catch (err) {
    unstable_rethrow(err)
    logError(err, "header.cartCount")
    return 0
  }
}

export async function SiteHeader() {
  const [session, count] = await Promise.all([auth(), cartCount()])
  const isAdmin = session?.user?.role === "admin"

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="bg-primary px-4 py-2 text-center text-xs font-medium text-primary-foreground">
        Free shipping on orders over ${shippingRules.freeThreshold} · 30-day free returns
      </div>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <MobileNav isAdmin={isAdmin} />

        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShoppingBag className="size-4" />
          </span>
          <span className="text-lg">{siteConfig.name}</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <HeaderSearch />
          {isAdmin && (
            <Link href="/admin" aria-label="Admin" className={buttonVariants({ variant: "ghost", size: "icon" })}>
              <LayoutDashboard />
            </Link>
          )}
          <Link
            href={session ? "/account" : "/login"}
            aria-label="Account"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <User />
          </Link>
          <CartSheet count={count} />
        </div>
      </div>
    </header>
  )
}
