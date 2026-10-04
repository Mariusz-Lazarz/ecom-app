"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChartLine, Inbox, LayoutDashboard, MessageSquareText, Newspaper, Package, Tag, TicketPercent } from "lucide-react"

import { cn } from "@/lib/utils"

export const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analytics", icon: ChartLine },
  { href: "/admin/orders", label: "Orders", icon: Package },
  { href: "/admin/products", label: "Products", icon: Tag },
  { href: "/admin/reviews", label: "Reviews", icon: MessageSquareText },
  { href: "/admin/discounts", label: "Discounts", icon: TicketPercent },
  { href: "/admin/messages", label: "Messages", icon: Inbox },
  { href: "/admin/newsletter", label: "Newsletter", icon: Newspaper },
] as const

/** The unread-messages badge's text: the count, capped at 99+. */
const badgeText = (count: number) => (count > 99 ? "99+" : String(count))

const isActive = (pathname: string, href: string) =>
  href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

/**
 * The admin area's section links (icons only below `md`, labels kept for screen readers); the current
 * section is marked with `aria-current="page"`. Messages carries a badge with `unreadMessages`
 * (hidden at 0).
 */
export function AdminNav({ unreadMessages = 0 }: { unreadMessages?: number }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Admin" className="flex items-center gap-0.5 sm:gap-1">
      {ADMIN_NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={href === "/admin/messages" && unreadMessages > 0 ? `${label}, ${unreadMessages} unread` : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors sm:px-3",
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-4" />
            <span className="max-md:sr-only">{label}</span>
            {href === "/admin/messages" && unreadMessages > 0 && (
              <span
                aria-hidden
                data-testid="unread-messages"
                className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums max-md:absolute max-md:top-0.5 max-md:right-0"
              >
                {badgeText(unreadMessages)}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
