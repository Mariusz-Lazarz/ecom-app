"use client"

import Link from "next/link"
import { useState } from "react"
import { LayoutDashboard, Menu } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { navLinks, siteConfig } from "@/lib/data"

/**
 * The slide-out menu on small screens, with an "Admin" link below the store links for admins.
 * Choosing a link closes it: a link that only changes the query (e.g. /products →
 * /products?onSale=true) keeps the header mounted, so the menu wouldn't close by itself.
 */
export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />}>
        <Menu />
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>{siteConfig.name}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <Separator className="my-2" />
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                <LayoutDashboard className="size-4" />
                Admin
              </Link>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
