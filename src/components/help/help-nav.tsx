"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { CreditCard, LifeBuoy, MessageCircle, RotateCcw, Truck } from "lucide-react"

import { cn } from "@/lib/utils"

export const HELP_LINKS = [
  { href: "/help/shipping", label: "Shipping", icon: Truck },
  { href: "/help/returns", label: "Returns", icon: RotateCcw },
  { href: "/help/payments", label: "Payments", icon: CreditCard },
  { href: "/help/contact", label: "Contact us", icon: MessageCircle },
] as const

/**
 * The bar under the store header on every /help page: one link per help topic, the current one
 * marked with `aria-current="page"`. Scrolls sideways on narrow screens, with the current topic
 * scrolled into view.
 */
export function HelpNav() {
  const pathname = usePathname()
  const activeRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
  }, [pathname])

  return (
    <div className="border-b bg-muted/40">
      <nav
        aria-label="Help topics"
        className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8"
      >
        <span className="mr-2 hidden items-center gap-1.5 text-sm font-semibold sm:flex">
          <LifeBuoy aria-hidden className="size-4" />
          Help
        </span>
        {HELP_LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              ref={active ? activeRef : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-xs ring-1 ring-foreground/10"
                  : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
