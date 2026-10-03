import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight, Heart, Package, type LucideIcon } from "lucide-react"

import { logout } from "@/app/actions/logout"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireUser } from "@/lib/auth-guards"

export const metadata: Metadata = {
  title: "Account — Northcart",
}

export default async function AccountPage() {
  // Signed-out visitors have no account to show.
  const session = await requireUser()

  // Auth.js stores "First Last" as the name; greet by first name only.
  const firstName = session.user.name?.split(" ")[0]

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {firstName ? `Hey ${firstName}, welcome back!` : "Welcome back!"}
          </h1>
          {session.user.role === "admin" && <Badge>Admin</Badge>}
        </div>
        <div className="grid w-full max-w-md gap-3">
          <AccountLink href="/account/orders" icon={Package} title="Your orders" description="Track, review or cancel your orders" />
          <AccountLink href="/account/wishlist" icon={Heart} title="Your wishlist" description="Products you saved for later" />
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </main>
      <SiteFooter />
    </>
  )
}

function AccountLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <Card className="transition-colors hover:bg-muted/50">
      <CardContent>
        <Link href={href} className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Icon className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block font-medium">{title}</span>
            <span className="block text-sm text-muted-foreground">{description}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </CardContent>
    </Card>
  )
}
