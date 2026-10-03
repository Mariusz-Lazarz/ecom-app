"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Package, Tag } from "lucide-react"

import { cn } from "@/lib/utils"

export const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: Package },
  { href: "/admin/products", label: "Products", icon: Tag },
] as const

const isActive = (pathname: string, href: string) =>
  href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

/** The admin area's section links; the current section is marked with `aria-current="page"`. */
export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Admin" className="flex items-center gap-1">
      {ADMIN_NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors sm:px-3",
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="hidden size-4 sm:block" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
