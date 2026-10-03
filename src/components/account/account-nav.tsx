"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { Heart, KeyRound, LayoutGrid, MapPin, Package, UserRound } from "lucide-react"

import { cn } from "@/lib/utils"

export const ACCOUNT_NAV_LINKS = [
  { href: "/account", label: "Overview", icon: LayoutGrid },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/profile", label: "Profile", icon: UserRound },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/security", label: "Security", icon: KeyRound },
] as const

const isActive = (pathname: string, href: string) =>
  href === "/account" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

/**
 * The account area's section links: a vertical list beside the content from `md` up, a row that
 * scrolls sideways above it on small screens (scrolled so the current section is in view). The
 * current section has `aria-current="page"`.
 */
export function AccountNav() {
  const pathname = usePathname()
  const activeRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
  }, [pathname])

  return (
    <nav aria-label="Account" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1 md:flex-col">
        {ACCOUNT_NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                ref={active ? activeRef : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
